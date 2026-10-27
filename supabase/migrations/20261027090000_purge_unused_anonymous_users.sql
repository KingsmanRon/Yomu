-- Retention: also remove anonymous Auth users that never became a learner.

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
