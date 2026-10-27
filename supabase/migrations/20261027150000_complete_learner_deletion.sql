-- Deleting a learner (their own deletion, withdrawing consent to online
-- storage, or the retention job) now also deletes their anonymous Auth user
-- in the same transaction, which ends its sessions and refresh tokens, and
-- the anonymous user of a phone they were moved away from whose revocation
-- is still pending. Before, the server deleted the Auth user in a separate
-- call after the learner's rows were gone. Only anonymous users are ever
-- deleted here; if Auth cannot be changed in the transaction, the learner's
-- data is still deleted and the route's Auth admin call and the retention
-- job remove the Auth user.

create or replace function public.delete_learner(p_learner uuid, p_initiated_by text default 'learner')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pseudonym text;
  v_auth_user uuid;
  v_users uuid[];
begin
  select l.pseudonym, l.auth_user_id into v_pseudonym, v_auth_user
  from public.learners l
  where l.id = p_learner
  for update;
  if not found then
    return false;
  end if;
  select array_remove(array_agg(t.old_auth_user_id), null) || array_remove(array[v_auth_user], null) into v_users
  from public.device_transfers t
  where t.learner_id = p_learner and t.status = 'revocation_pending';

  delete from public.analytics_events where pseudonym = v_pseudonym;
  delete from public.error_logs where pseudonym = v_pseudonym;
  delete from public.learners where id = p_learner;
  insert into public.deletion_log (initiated_by) values (p_initiated_by);

  begin
    delete from auth.users u where u.id = any(v_users) and u.is_anonymous;
  exception when others then
    null;
  end;
  return true;
end;
$$;
