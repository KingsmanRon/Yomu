-- Atomic learner registration.
--
-- Registration used to be four separate writes (learner, then credentials,
-- device link and consent in parallel) with a compensating delete when one
-- failed. A crash or a failed compensation could leave a learner row without
-- a consent record or credentials. This function does all of it in one
-- transaction: either everything exists, or nothing does.
--
-- It is called only by the server (service role), after the route has
-- verified the caller's session and hashed the PIN. Concurrent calls for the
-- same Auth user are serialised, so a retried or doubled request returns the
-- learner already created instead of failing.

create or replace function public.register_learner(
  p_auth_user uuid,
  p_device_profile uuid,
  p_language text,
  p_avatar text,
  p_nickname text,
  p_pin_hash text,
  p_consent_version text,
  p_consent_language text,
  p_analytics boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anonymous boolean;
  v_learner uuid;
  v_constraint text;
begin
  -- One binding change at a time per Auth user (registration or a move to a
  -- new phone; released at commit or rollback).
  perform pg_advisory_xact_lock(hashtextextended('learner_binding:' || p_auth_user::text, 0));

  select u.is_anonymous into v_anonymous from auth.users u where u.id = p_auth_user;
  if not found then
    return jsonb_build_object('error', 'unknown_user');
  end if;
  -- Learners are anonymous Auth users created on the phone after spoken
  -- consent; staff (email) accounts can never become learners.
  if not coalesce(v_anonymous, false) then
    return jsonb_build_object('error', 'not_anonymous');
  end if;

  select l.id into v_learner from public.learners l where l.auth_user_id = p_auth_user;
  if found then
    return jsonb_build_object('learnerId', v_learner, 'alreadyRegistered', true);
  end if;

  if p_pin_hash is null or p_pin_hash !~ '^scrypt\$' then
    raise exception 'invalid PIN hash' using errcode = '22023';
  end if;
  if coalesce(p_consent_version, '') = '' then
    raise exception 'consent version required' using errcode = '22023';
  end if;

  begin
    insert into public.learners (auth_user_id, teaching_language, avatar_id, nickname)
    values (p_auth_user, p_language, p_avatar, nullif(btrim(p_nickname), ''))
    returning id into v_learner;

    insert into public.learner_credentials (learner_id, pin_hash) values (v_learner, p_pin_hash);
    insert into public.device_profiles (id, learner_id) values (p_device_profile, v_learner);
    insert into public.consent_records (learner_id, consent_type, version, language)
    values (v_learner, 'account_storage', p_consent_version, p_consent_language);
    if p_analytics then
      insert into public.consent_records (learner_id, consent_type, version, language)
      values (v_learner, 'analytics', p_consent_version, p_consent_language);
    end if;
  exception when unique_violation then
    -- Everything in this block is rolled back.
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'device_profiles_pkey' then
      return jsonb_build_object('error', 'device_profile_taken');
    end if;
    raise;
  end;

  return jsonb_build_object('learnerId', v_learner, 'alreadyRegistered', false);
end;
$$;

revoke all on function public.register_learner(uuid, uuid, text, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.register_learner(uuid, uuid, text, text, text, text, text, text, boolean) to service_role;
