-- Server-side PIN checks and facilitator-assisted resets.
--
-- PIN attempts were read, verified and then counted in separate steps
-- (read-modify-write), so parallel guesses all saw the same count and none
-- of them triggered the wait. A facilitator reset changed the PIN and then
-- wrote the audit record separately, so a failure could leave a reset with no
-- audit trail; and assisted mode checked "is a facilitator somewhere and
-- linked to the class", not "is a facilitator in the class's organisation"
-- as the database's own staff checks do.
--
-- All functions here are for the server (service role) only.

-- Wait after repeated wrong PINs: none for the first four, then doubling from
-- 30 seconds, at most 4 hours. Never a lockout: a facilitator can reset.
create or replace function public.pin_retry_delay_seconds(p_failed int)
returns int
language sql
immutable
set search_path = ''
as $$
  select case when p_failed < 5 then 0 else least(14400, (30 * power(2, least(p_failed - 5, 20)))::int) end
$$;

-- Start a PIN check. The attempt is counted (and any wait set) before the PIN
-- is verified, under a row lock, so parallel guesses cannot slip through
-- while the count is still low. Returns the stored hash to verify against.
create or replace function public.pin_attempt_begin(p_learner uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.learner_credentials;
  v_delay int;
begin
  select * into v from public.learner_credentials c where c.learner_id = p_learner for update;
  if not found then
    return jsonb_build_object('status', 'no_credentials');
  end if;
  if v.retry_after is not null and v.retry_after > now() then
    return jsonb_build_object('status', 'wait', 'retryAfter', v.retry_after);
  end if;
  v_delay := public.pin_retry_delay_seconds(v.failed_attempts + 1);
  update public.learner_credentials c
  set failed_attempts = v.failed_attempts + 1,
      retry_after = case when v_delay > 0 then now() + make_interval(secs => v_delay) else null end
  where c.learner_id = p_learner;
  return jsonb_build_object('status', 'check', 'pinHash', v.pin_hash);
end;
$$;

-- Finish a correct PIN check: clear the count and, when given, set a new
-- PIN. Applies only if the PIN is still the one that was verified (a reset
-- in between wins).
create or replace function public.pin_attempt_succeeded(p_learner uuid, p_verified_hash text, p_new_hash text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_new_hash is not null and p_new_hash !~ '^scrypt\$' then
    raise exception 'invalid PIN hash' using errcode = '22023';
  end if;
  update public.learner_credentials c
  set failed_attempts = 0,
      retry_after = null,
      pin_hash = coalesce(p_new_hash, c.pin_hash),
      updated_at = case when p_new_hash is null then c.updated_at else now() end
  where c.learner_id = p_learner and c.pin_hash = p_verified_hash;
  return found;
end;
$$;

-- Classes in which a staff user may help a learner on the learner's phone:
-- live classes they facilitate, in an organisation where they hold the
-- facilitator role (the same rule as public.is_cohort_facilitator), with the
-- learner an active member.
create or replace function public.assist_learners(p_facilitator uuid)
returns table (cohort_id uuid, cohort_name text, learner_id uuid, avatar_id text, nickname text, teaching_language text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, l.id, l.avatar_id, l.nickname, l.teaching_language
  from public.cohorts c
  join public.cohort_facilitators f on f.cohort_id = c.id and f.user_id = p_facilitator
  join public.staff_roles s on s.user_id = p_facilitator and s.role = 'facilitator' and s.organisation_id = c.organisation_id
  join public.cohort_memberships m on m.cohort_id = c.id and m.status = 'active'
  join public.learners l on l.id = m.learner_id
  where c.archived_at is null
  order by c.name, m.joined_at
$$;

-- Reset a forgotten PIN with a facilitator present: authorisation, the new
-- PIN and the audit record in one transaction. The membership row is locked,
-- so a learner leaving the class at the same moment cannot be reset after
-- leaving.
create or replace function public.assist_reset_pin(p_facilitator uuid, p_learner uuid, p_pin_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cohort uuid;
begin
  if p_pin_hash is null or p_pin_hash !~ '^scrypt\$' then
    raise exception 'invalid PIN hash' using errcode = '22023';
  end if;
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
  update public.learner_credentials c
  set pin_hash = p_pin_hash, failed_attempts = 0, retry_after = null, updated_at = now()
  where c.learner_id = p_learner;
  if not found then
    return jsonb_build_object('error', 'no_credentials');
  end if;
  insert into public.facilitator_assists (learner_id, facilitator_user_id, cohort_id, action)
  values (p_learner, p_facilitator, v_cohort, 'pin_reset');
  return jsonb_build_object('ok', true, 'cohortId', v_cohort);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'pin_retry_delay_seconds(int)', 'pin_attempt_begin(uuid)', 'pin_attempt_succeeded(uuid, text, text)',
    'assist_learners(uuid)', 'assist_reset_pin(uuid, uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
