-- Recoverable move of a learner to a new phone.
--
-- A move used to be six separate operations (PIN check or reset, rebinding,
-- device link, audit records, deleting the old phone's Auth user), with the
-- revocation's result unchecked and no way to repeat a request whose reply
-- was lost: a retry failed with "already registered" even when the move had
-- happened, and a failure part-way left a half-moved learner.
--
-- Now:
--   * the new phone chooses a transfer ID (idempotency key); a repeated
--     request returns the recorded outcome;
--   * authorisation, the PIN step, rebinding, the device link, the audit
--     records and the old phone's revocation happen in one transaction;
--   * two moves of the same learner at once cannot both win (the request
--     states which phone it expects to replace);
--   * if the old phone's Auth user cannot be deleted inside the transaction,
--     the move still completes (the old phone has already lost all access,
--     because nothing is bound to it) and is recorded as
--     'revocation_pending'; the server and the daily retention job retry.

create table public.device_transfers (
  id uuid primary key,
  learner_id uuid not null references public.learners (id) on delete cascade,
  facilitator_user_id uuid references auth.users (id) on delete set null,
  cohort_id uuid references public.cohorts (id) on delete set null,
  new_auth_user_id uuid not null,
  old_auth_user_id uuid,
  device_profile_id uuid not null,
  pin_reset boolean not null,
  status text not null check (status in ('completed', 'revocation_pending')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index device_transfers_learner on public.device_transfers (learner_id, created_at);
create index device_transfers_pending on public.device_transfers (status) where status = 'revocation_pending';
comment on table public.device_transfers is 'Moves of a learner to a new phone with a facilitator. The ID is the idempotency key chosen by the new phone. revocation_pending: the learner is bound to the new phone (the old phone can read nothing) but the old phone''s Auth user still has to be deleted; retried by the server and the retention job.';

alter table public.device_transfers enable row level security;
revoke all on table public.device_transfers from anon, authenticated;
grant select, insert, update, delete on table public.device_transfers to service_role;

-- What a move returns to the new phone (and, internally, the old Auth user).
create or replace function public.transfer_result(p_transfer public.device_transfers)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'transferId', p_transfer.id,
    'status', p_transfer.status,
    'oldSessionRevoked', p_transfer.status = 'completed',
    'oldAuthUserId', p_transfer.old_auth_user_id,
    'learnerId', l.id,
    'language', l.teaching_language,
    'avatarId', l.avatar_id,
    'nickname', l.nickname,
    'analyticsConsent', exists (
      select 1 from public.consent_records c
      where c.learner_id = l.id and c.consent_type = 'analytics' and c.withdrawn_at is null
    )
  )
  from public.learners l
  where l.id = p_transfer.learner_id
$$;

create or replace function public.transfer_learner(
  p_transfer uuid,
  p_facilitator uuid,
  p_learner uuid,
  p_new_user uuid,
  p_device_profile uuid,
  p_expected_old_user uuid,
  p_verified_hash text,
  p_new_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.device_transfers;
  v_learner public.learners;
  v_cohort uuid;
  v_anonymous boolean;
  v_old_anonymous boolean;
  v_revoked boolean := true;
begin
  if (p_verified_hash is null) = (p_new_hash is null) then
    raise exception 'give exactly one of the verified PIN and a new PIN' using errcode = '22023';
  end if;
  if p_new_hash is not null and p_new_hash !~ '^scrypt\$' then
    raise exception 'invalid PIN hash' using errcode = '22023';
  end if;

  -- Serialise with registration or another move involving the new phone's
  -- user, then with any other move of this learner (row lock).
  perform pg_advisory_xact_lock(hashtextextended('learner_binding:' || p_new_user::text, 0));
  select * into v_learner from public.learners l where l.id = p_learner for update;
  if not found then
    return jsonb_build_object('error', 'learner_not_found');
  end if;

  -- The same request again (its reply was lost): the recorded outcome.
  select * into v_existing from public.device_transfers t where t.id = p_transfer;
  if found then
    if v_existing.learner_id <> p_learner or v_existing.new_auth_user_id <> p_new_user or v_existing.device_profile_id <> p_device_profile then
      return jsonb_build_object('error', 'transfer_id_conflict');
    end if;
    if v_existing.facilitator_user_id is distinct from p_facilitator and not exists (
      select 1 from public.assist_learners(p_facilitator) a where a.learner_id = p_learner
    ) then
      return jsonb_build_object('error', 'not_your_learner');
    end if;
    return public.transfer_result(v_existing);
  end if;

  -- Authorisation, as for a PIN reset: the facilitator role in the class's
  -- organisation, a live class, the learner an active member (rows locked).
  select c.id into v_cohort
  from public.cohorts c
  join public.cohort_facilitators f on f.cohort_id = c.id and f.user_id = p_facilitator
  join public.staff_roles s on s.user_id = p_facilitator and s.role = 'facilitator' and s.organisation_id = c.organisation_id
  join public.cohort_memberships m on m.cohort_id = c.id and m.learner_id = p_learner and m.status = 'active'
  where c.archived_at is null
  order by c.created_at
  limit 1
  for share of m, c;
  if v_cohort is null then
    return jsonb_build_object('error', 'not_your_learner');
  end if;

  -- Two moves at once cannot both win: the learner must still be on the
  -- phone this request was prepared against.
  if v_learner.auth_user_id is distinct from p_expected_old_user then
    return jsonb_build_object('error', 'learner_moved');
  end if;

  -- The new phone: an anonymous user that holds no learner, and an unused
  -- device profile.
  select u.is_anonymous into v_anonymous from auth.users u where u.id = p_new_user;
  if not found then
    return jsonb_build_object('error', 'device_unauthenticated');
  end if;
  if not coalesce(v_anonymous, false) then
    return jsonb_build_object('error', 'device_not_anonymous');
  end if;
  if exists (select 1 from public.learners l where l.auth_user_id = p_new_user) then
    return jsonb_build_object('error', 'device_already_registered');
  end if;
  if exists (select 1 from public.device_profiles d where d.id = p_device_profile) then
    return jsonb_build_object('error', 'device_profile_taken');
  end if;

  -- The PIN: a new one chosen by the learner (a reset), or the one the server
  -- just verified, provided it has not changed since.
  if p_new_hash is not null then
    update public.learner_credentials c
    set pin_hash = p_new_hash, failed_attempts = 0, retry_after = null, updated_at = now()
    where c.learner_id = p_learner;
    if not found then
      return jsonb_build_object('error', 'no_credentials');
    end if;
    insert into public.facilitator_assists (learner_id, facilitator_user_id, cohort_id, action)
    values (p_learner, p_facilitator, v_cohort, 'pin_reset');
  else
    update public.learner_credentials c
    set failed_attempts = 0, retry_after = null
    where c.learner_id = p_learner and c.pin_hash = p_verified_hash;
    if not found then
      return jsonb_build_object('error', 'pin_changed');
    end if;
  end if;

  update public.learners l set auth_user_id = p_new_user, updated_at = now() where l.id = p_learner;
  insert into public.device_profiles (id, learner_id) values (p_device_profile, p_learner);
  insert into public.facilitator_assists (learner_id, facilitator_user_id, cohort_id, action)
  values (p_learner, p_facilitator, v_cohort, 'device_transfer');

  -- Revoke the old phone. From the rebinding above it can read and change
  -- nothing (row-level security and the API resolve learners by Auth user).
  -- Deleting its anonymous Auth user also ends its sessions and refresh
  -- tokens. Staff (non-anonymous) accounts are never deleted here.
  if v_learner.auth_user_id is not null then
    select u.is_anonymous into v_old_anonymous from auth.users u where u.id = v_learner.auth_user_id;
    if found and coalesce(v_old_anonymous, false) then
      begin
        delete from auth.users u where u.id = v_learner.auth_user_id;
      exception when others then
        v_revoked := false;
      end;
    end if;
  end if;

  insert into public.device_transfers (
    id, learner_id, facilitator_user_id, cohort_id, new_auth_user_id, old_auth_user_id, device_profile_id, pin_reset, status, revoked_at
  )
  values (
    p_transfer, p_learner, p_facilitator, v_cohort, p_new_user, v_learner.auth_user_id, p_device_profile, p_new_hash is not null,
    case when v_revoked then 'completed' else 'revocation_pending' end,
    case when v_revoked then now() end
  )
  returning * into v_existing;
  return public.transfer_result(v_existing);
end;
$$;

-- The old phone's Auth user was deleted outside the transaction (by the
-- server through the Auth admin API).
create or replace function public.transfer_mark_revoked(p_transfer uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.device_transfers t
  set status = 'completed', revoked_at = now()
  where t.id = p_transfer and t.status = 'revocation_pending';
  return found;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'transfer_result(public.device_transfers)',
    'transfer_learner(uuid, uuid, uuid, uuid, uuid, uuid, text, text)',
    'transfer_mark_revoked(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Retention job: everything it did before, plus finishing revocations left
-- pending by a move.
create or replace function public.purge_expired()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_n int;
  v_orphan uuid;
  v_transfer public.device_transfers;
begin
  delete from public.tutor_logs where expires_at < now();
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('tutor_logs', v_n);
  delete from public.tutor_requests where created_at < now() - interval '2 days';
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('tutor_requests', v_n);
  delete from public.join_attempts where created_at < now() - interval '2 days';
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('join_attempts', v_n);
  delete from public.analytics_events where received_at < now() - interval '13 months';
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('analytics_events', v_n);
  delete from public.error_logs where created_at < now() - interval '90 days';
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('error_logs', v_n);
  delete from public.tutor_unanswered_intents where created_at < now() - interval '12 months';
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('tutor_unanswered_intents', v_n);
  -- Learners whose Auth user was removed and not re-linked within 30 days.
  v_n := 0;
  for v_orphan in select l.id from public.learners l where l.auth_user_id is null and l.updated_at < now() - interval '30 days'
  loop
    perform public.delete_learner(v_orphan, 'retention');
    v_n := v_n + 1;
  end loop;
  v_result := v_result || jsonb_build_object('orphaned_learners', v_n);
  -- Old phones whose revocation could not be finished during a move.
  v_n := 0;
  for v_transfer in select * from public.device_transfers t where t.status = 'revocation_pending'
  loop
    begin
      delete from auth.users u
      where u.id = v_transfer.old_auth_user_id
        and u.is_anonymous
        and not exists (select 1 from public.learners l where l.auth_user_id = u.id);
      update public.device_transfers t set status = 'completed', revoked_at = now() where t.id = v_transfer.id;
      v_n := v_n + 1;
    exception when others then
      null;
    end;
  end loop;
  v_result := v_result || jsonb_build_object('transfer_revocations', v_n);
  -- Anonymous sign-ins that never became a learner (for example a phone
  -- whose registration or move to a new phone was not completed).
  delete from auth.users u
  where u.is_anonymous
    and u.created_at < now() - interval '7 days'
    and not exists (select 1 from public.learners l where l.auth_user_id = u.id);
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('unused_anonymous_users', v_n);
  return v_result;
end;
$$;
