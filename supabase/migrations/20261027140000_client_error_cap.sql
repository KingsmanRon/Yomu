-- Client error reports come from an endpoint anyone can call (errors can
-- happen before a learner registers). Their storage is capped globally per
-- minute, so a flood cannot grow the table without bound or bury real
-- errors for long; server errors are not affected.

create index if not exists error_logs_created on public.error_logs (created_at);

create or replace function public.log_client_errors(p_rows jsonb, p_per_minute int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent int;
  v_take int;
begin
  -- One writer at a time, so concurrent reports cannot overshoot the cap.
  perform pg_advisory_xact_lock(hashtextextended('client_error_logs', 0));
  select count(*) into v_recent
  from public.error_logs e
  where e.created_at > now() - interval '1 minute' and e.context ->> 'kind' = 'client';
  v_take := greatest(0, least(jsonb_array_length(p_rows), p_per_minute - v_recent));
  insert into public.error_logs (message, context, build_id)
  select left(r ->> 'message', 500), coalesce(r -> 'context', '{}'::jsonb) || jsonb_build_object('kind', 'client'), r ->> 'build_id'
  from jsonb_array_elements(p_rows) with ordinality as t(r, n)
  where n <= v_take;
  return v_take;
end;
$$;

revoke all on function public.log_client_errors(jsonb, int) from public, anon, authenticated;
grant execute on function public.log_client_errors(jsonb, int) to service_role;
