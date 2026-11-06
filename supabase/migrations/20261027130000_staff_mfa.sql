-- Mandatory multi-factor authentication for staff.
--
-- Every staff permission now requires a session at Authenticator Assurance
-- Level 2 (password + TOTP code): the role helpers behind all staff
-- row-level security policies and staff functions check the access token's
-- `aal` claim and that its Auth session still exists at aal2, so signing out,
-- recovery and an administrator's reset take effect at once rather than when
-- the access token expires. The server checks the same (requireStaff).
-- Learners are anonymous users at aal1 and never use these helpers, so their
-- picture-and-code access is unchanged.
--
-- Recovery: one-time recovery codes (stored as keyed hashes) let a staff
-- member who lost their authenticator remove it, end their other sessions and
-- enrol a new one; a platform administrator can also reset another staff
-- member's MFA after checking their identity. Both are recorded in
-- staff_security_events.

create or replace function public.staff_mfa_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
    and exists (
      select 1 from auth.sessions s
      where s.id = nullif((select auth.jwt() ->> 'session_id'), '')::uuid
        and s.user_id = (select auth.uid())
        and s.aal = 'aal2'
        and (s.not_after is null or s.not_after > now())
    )
$$;

create or replace function public.has_staff_role(p_role text, p_org uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.staff_mfa_verified() and exists (
    select 1 from public.staff_roles s
    where s.user_id = (select auth.uid())
      and s.role = p_role
      and (p_org is null or s.organisation_id = p_org)
  )
$$;

create or replace function public.is_cohort_facilitator(p_cohort uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.staff_mfa_verified() and exists (
    select 1
    from public.cohort_facilitators f
    join public.cohorts c on c.id = f.cohort_id
    join public.staff_roles s on s.user_id = f.user_id and s.role = 'facilitator' and s.organisation_id = c.organisation_id
    where f.cohort_id = p_cohort and f.user_id = (select auth.uid())
  )
$$;

create or replace function public.is_cohort_org_admin(p_cohort uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.staff_mfa_verified() and exists (
    select 1
    from public.cohorts c
    join public.staff_roles s on s.organisation_id = c.organisation_id and s.role = 'org_admin'
    where c.id = p_cohort and s.user_id = (select auth.uid())
  )
$$;

revoke all on function public.staff_mfa_verified() from public, anon;
grant execute on function public.staff_mfa_verified() to authenticated, service_role;

-- The two staff policies that did not go through the helpers.
drop policy "staff read their organisations" on public.organisations;
create policy "staff read their organisations" on public.organisations
  for select to authenticated using (
    (select public.staff_mfa_verified())
    and exists (select 1 from public.staff_roles s where s.user_id = (select auth.uid()) and s.organisation_id = organisations.id)
  );

drop policy "staff read facilitator assignments of visible cohorts" on public.cohort_facilitators;
create policy "staff read facilitator assignments of visible cohorts" on public.cohort_facilitators
  for select to authenticated using (
    ((select public.staff_mfa_verified()) and user_id = (select auth.uid())) or (select public.is_cohort_org_admin(cohort_id))
  );

------------------------------------------------------------------------------
-- Recovery codes and security events (server only)
------------------------------------------------------------------------------

create table public.staff_mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  unique (user_id, code_hash)
);
comment on table public.staff_mfa_recovery_codes is 'One-time MFA recovery codes for staff, as keyed hashes (HMAC with a server secret). Shown to the staff member once.';

create table public.staff_security_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  event text not null check (event in ('mfa_recovery_codes_issued', 'mfa_recovered', 'mfa_recovery_failed', 'mfa_reset_by_admin')),
  created_at timestamptz not null default now()
);
create index staff_security_events_user on public.staff_security_events (user_id, event, created_at);
comment on table public.staff_security_events is 'Audit of staff MFA recovery: codes issued, codes used or wrong, resets by a platform administrator.';

alter table public.staff_mfa_recovery_codes enable row level security;
alter table public.staff_security_events enable row level security;
revoke all on table public.staff_mfa_recovery_codes from anon, authenticated;
revoke all on table public.staff_security_events from anon, authenticated;
grant select, insert, update, delete on table public.staff_mfa_recovery_codes to service_role;
grant select, insert, update, delete on table public.staff_security_events to service_role;
grant usage, select on sequence public.staff_security_events_id_seq to service_role;

-- Replace the staff member's recovery codes (shown once by the server).
create or replace function public.staff_mfa_issue_recovery_codes(p_user uuid, p_hashes text[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.staff_roles s where s.user_id = p_user) then
    raise exception 'not a staff account' using errcode = '42501';
  end if;
  if coalesce(array_length(p_hashes, 1), 0) < 8 then
    raise exception 'too few codes' using errcode = '22023';
  end if;
  delete from public.staff_mfa_recovery_codes c where c.user_id = p_user;
  insert into public.staff_mfa_recovery_codes (user_id, code_hash) select p_user, h from unnest(p_hashes) h;
  insert into public.staff_security_events (user_id, actor_user_id, event) values (p_user, p_user, 'mfa_recovery_codes_issued');
  return array_length(p_hashes, 1);
end;
$$;

-- Use a recovery code: at most 5 wrong codes per 15 minutes; a right one is
-- spent, removes the user's authenticators and ends every other session (the
-- lost device may be in someone else's hands), in one transaction.
create or replace function public.staff_mfa_recover(p_user uuid, p_code_hash text, p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('staff_mfa_recover:' || p_user::text, 0));
  if (
    select count(*) from public.staff_security_events e
    where e.user_id = p_user and e.event = 'mfa_recovery_failed' and e.created_at > now() - interval '15 minutes'
  ) >= 5 then
    return jsonb_build_object('status', 'wait');
  end if;
  update public.staff_mfa_recovery_codes c
  set used_at = now()
  where c.user_id = p_user and c.code_hash = p_code_hash and c.used_at is null
  returning c.id into v_code;
  if v_code is null then
    insert into public.staff_security_events (user_id, actor_user_id, event) values (p_user, p_user, 'mfa_recovery_failed');
    return jsonb_build_object('status', 'wrong');
  end if;
  delete from auth.mfa_factors f where f.user_id = p_user;
  delete from auth.sessions s where s.user_id = p_user and s.id is distinct from p_session;
  insert into public.staff_security_events (user_id, actor_user_id, event) values (p_user, p_user, 'mfa_recovered');
  return jsonb_build_object(
    'status', 'ok',
    'remaining', (select count(*) from public.staff_mfa_recovery_codes c where c.user_id = p_user and c.used_at is null)
  );
end;
$$;

-- A platform administrator resets another staff member's MFA (after checking
-- who they are by other means): authenticators, recovery codes and every
-- session are removed; the staff member enrols again at next sign-in.
create or replace function public.staff_mfa_reset(p_admin uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not exists (select 1 from public.staff_roles s where s.user_id = p_admin and s.role = 'platform_admin') then
    return jsonb_build_object('error', 'forbidden');
  end if;
  select u.id into v_user
  from auth.users u
  where lower(u.email) = lower(trim(p_email)) and exists (select 1 from public.staff_roles s where s.user_id = u.id);
  if v_user is null then
    return jsonb_build_object('error', 'not_staff');
  end if;
  if v_user = p_admin then
    return jsonb_build_object('error', 'own_account');
  end if;
  delete from auth.mfa_factors f where f.user_id = v_user;
  delete from public.staff_mfa_recovery_codes c where c.user_id = v_user;
  delete from auth.sessions s where s.user_id = v_user;
  insert into public.staff_security_events (user_id, actor_user_id, event) values (v_user, p_admin, 'mfa_reset_by_admin');
  return jsonb_build_object('ok', true);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'staff_mfa_issue_recovery_codes(uuid, text[])', 'staff_mfa_recover(uuid, text, uuid)', 'staff_mfa_reset(uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
