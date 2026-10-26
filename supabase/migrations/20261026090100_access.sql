-- Access control: row-level security for every table, explicit grants
-- (auto_expose_new_tables = false), and role helper functions.
--
-- Roles:
--   learner           an anonymous Supabase Auth user linked to public.learners
--   facilitator       staff_roles.role = 'facilitator' for an organisation, assigned to cohorts
--   org_admin         staff_roles.role = 'org_admin' for an organisation
--   content_reviewer  staff_roles.role = 'content_reviewer'
--   service_role      server only (bypasses RLS); used by the Next.js API routes
--
-- Facilitators and organisation admins never read learner tables directly:
-- they call the security-definer functions in 20261026090200_functions.sql,
-- which apply each learner's sharing consent field by field.

------------------------------------------------------------------------------
-- Helper functions
------------------------------------------------------------------------------

create or replace function public.current_learner_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.id from public.learners l where l.auth_user_id = (select auth.uid())
$$;

create or replace function public.has_staff_role(p_role text, p_org uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
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
  select exists (
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
  select exists (
    select 1
    from public.cohorts c
    join public.staff_roles s on s.organisation_id = c.organisation_id and s.role = 'org_admin'
    where c.id = p_cohort and s.user_id = (select auth.uid())
  )
$$;

revoke all on function public.current_learner_id() from public, anon;
revoke all on function public.has_staff_role(text, uuid) from public, anon;
revoke all on function public.is_cohort_facilitator(uuid) from public, anon;
revoke all on function public.is_cohort_org_admin(uuid) from public, anon;
grant execute on function public.current_learner_id() to authenticated;
grant execute on function public.has_staff_role(text, uuid) to authenticated;
grant execute on function public.is_cohort_facilitator(uuid) to authenticated;
grant execute on function public.is_cohort_org_admin(uuid) to authenticated;

------------------------------------------------------------------------------
-- Enable RLS everywhere. A table with RLS and no policy is closed to clients.
------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'organisations', 'staff_roles', 'cohorts', 'cohort_facilitators', 'learners', 'learner_credentials',
    'device_profiles', 'cohort_memberships', 'consent_records', 'facilitator_assists', 'content_versions',
    'curriculum_levels', 'units', 'lessons', 'learning_objectives', 'exercises', 'aet_outcomes', 'aet_mappings',
    'content_assets', 'content_reviews', 'provider_capabilities', 'sync_operations', 'learning_attempts',
    'lesson_completions', 'assessment_results', 'learner_progress', 'objective_mastery', 'learner_achievements',
    'streak_days', 'revision_schedule', 'tutor_requests', 'tutor_logs', 'tutor_unanswered_intents',
    'ai_spend_daily', 'analytics_events', 'error_logs', 'deletion_log', 'join_attempts'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

------------------------------------------------------------------------------
-- Public curriculum: readable by anyone (it is shipped in the app anyway)
------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['curriculum_levels', 'units', 'lessons', 'learning_objectives', 'exercises', 'aet_outcomes', 'aet_mappings', 'content_versions']
  loop
    execute format('grant select on table public.%I to anon, authenticated', t);
    execute format('create policy "curriculum is public" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

grant select on table public.provider_capabilities to authenticated;
create policy "capability matrix is readable by signed-in users" on public.provider_capabilities
  for select to authenticated using (true);

------------------------------------------------------------------------------
-- Learner: own rows only
------------------------------------------------------------------------------

grant select on table public.learners to authenticated;
create policy "learners read their own record" on public.learners
  for select to authenticated using (auth_user_id = (select auth.uid()));

do $$
declare
  t text;
begin
  foreach t in array array[
    'device_profiles', 'consent_records', 'sync_operations', 'learning_attempts', 'lesson_completions',
    'assessment_results', 'learner_progress', 'objective_mastery', 'learner_achievements', 'streak_days',
    'revision_schedule', 'tutor_logs'
  ] loop
    execute format('grant select on table public.%I to authenticated', t);
    execute format(
      'create policy "learners read their own %s" on public.%I for select to authenticated using (learner_id = (select public.current_learner_id()))',
      t, t
    );
  end loop;
end $$;

-- Memberships: the learner sees their own; facilitators see memberships of
-- their cohorts (needed to know which fields each learner shares); org admins
-- see memberships in their organisation's cohorts for aggregate counts.
grant select on table public.cohort_memberships to authenticated;
create policy "learners read their own memberships" on public.cohort_memberships
  for select to authenticated using (learner_id = (select public.current_learner_id()));
create policy "facilitators read memberships of their cohorts" on public.cohort_memberships
  for select to authenticated using ((select public.is_cohort_facilitator(cohort_id)));
create policy "org admins read memberships of their cohorts" on public.cohort_memberships
  for select to authenticated using ((select public.is_cohort_org_admin(cohort_id)));

-- Writes to learner data go through the server API (service role), which
-- validates operations and recomputes progress. No client write grants.

------------------------------------------------------------------------------
-- Staff
------------------------------------------------------------------------------

grant select on table public.staff_roles to authenticated;
create policy "staff read their own roles" on public.staff_roles
  for select to authenticated using (user_id = (select auth.uid()));

grant select on table public.organisations to authenticated;
create policy "staff read their organisations" on public.organisations
  for select to authenticated using (
    exists (select 1 from public.staff_roles s where s.user_id = (select auth.uid()) and s.organisation_id = organisations.id)
  );

grant select, update (name, join_open, encouragement_enabled, archived_at) on table public.cohorts to authenticated;
create policy "facilitators and org admins read cohorts" on public.cohorts
  for select to authenticated using ((select public.is_cohort_facilitator(id)) or (select public.is_cohort_org_admin(id)));
create policy "facilitators and org admins update cohorts" on public.cohorts
  for update to authenticated
  using ((select public.is_cohort_facilitator(id)) or (select public.is_cohort_org_admin(id)))
  with check ((select public.is_cohort_facilitator(id)) or (select public.is_cohort_org_admin(id)));
-- Cohorts are created with public.create_cohort(), which also assigns the facilitator.

grant select on table public.cohort_facilitators to authenticated;
create policy "staff read facilitator assignments of visible cohorts" on public.cohort_facilitators
  for select to authenticated using (
    user_id = (select auth.uid()) or (select public.is_cohort_org_admin(cohort_id))
  );

------------------------------------------------------------------------------
-- Content review: reviewers read assets and record reviews; no learner data
------------------------------------------------------------------------------

grant select on table public.content_assets to authenticated;
create policy "reviewers and admins read content assets" on public.content_assets
  for select to authenticated using (
    (select public.has_staff_role('content_reviewer')) or (select public.has_staff_role('platform_admin'))
  );

grant select, insert (asset_id, status, reviewer_role, notes, reviewer_user_id) on table public.content_reviews to authenticated;
create policy "reviewers read reviews" on public.content_reviews
  for select to authenticated using (
    (select public.has_staff_role('content_reviewer')) or (select public.has_staff_role('platform_admin'))
  );
create policy "reviewers record their own reviews" on public.content_reviews
  for insert to authenticated with check (
    (select public.has_staff_role('content_reviewer')) and reviewer_user_id = (select auth.uid())
  );

-- A review updates the asset's current status.
create or replace function public.apply_content_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.content_assets set review_status = new.status, updated_at = now() where id = new.asset_id;
  return new;
end;
$$;
revoke all on function public.apply_content_review() from public, anon, authenticated;
create trigger content_reviews_apply after insert on public.content_reviews
  for each row execute function public.apply_content_review();

-- Tables with no client policies at all (server only): learner_credentials,
-- facilitator_assists, tutor_requests, tutor_unanswered_intents, ai_spend_daily,
-- analytics_events, error_logs, deletion_log, join_attempts.
