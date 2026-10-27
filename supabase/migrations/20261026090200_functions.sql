-- Functions for staff reporting (consent-filtered), cohort management,
-- offline sync, consent changes, deletion, AI cost controls and retention.

------------------------------------------------------------------------------
-- Staff-callable functions (security definer, checks the caller's role)
------------------------------------------------------------------------------

create or replace function public.create_cohort(p_org uuid, p_name text)
returns public.cohorts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_cohort public.cohorts;
begin
  if not (public.has_staff_role('facilitator', p_org) or public.has_staff_role('org_admin', p_org)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  loop
    v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
    exit when not exists (select 1 from public.cohorts c where c.join_code = v_code);
  end loop;
  insert into public.cohorts (organisation_id, name, join_code, created_by)
  values (p_org, p_name, v_code, (select auth.uid()))
  returning * into v_cohort;
  if public.has_staff_role('facilitator', p_org) then
    insert into public.cohort_facilitators (cohort_id, user_id) values (v_cohort.id, (select auth.uid()));
  end if;
  return v_cohort;
end;
$$;

-- Per-learner progress for a facilitator, limited to the fields each learner
-- consented to share. Withdrawn learners disappear immediately.
create or replace function public.facilitator_cohort_learners(p_cohort uuid)
returns table (
  learner_id uuid,
  avatar_id text,
  nickname text,
  joined_at timestamptz,
  share_progress boolean,
  share_mastery boolean,
  share_mistakes boolean,
  share_tutor_logs boolean,
  current_level smallint,
  lessons_completed int,
  last_active_date date,
  objectives_mastered int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_cohort_facilitator(p_cohort) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select
    m.learner_id,
    l.avatar_id,
    l.nickname,
    m.joined_at,
    m.share_progress,
    m.share_mastery,
    m.share_mistakes,
    m.share_tutor_logs,
    case when m.share_progress then coalesce(p.current_level, l.current_level) end,
    case when m.share_progress then coalesce(p.lessons_completed, 0) end,
    case when m.share_progress then coalesce(p.last_active_date, l.last_active_date) end,
    case when m.share_mastery then coalesce(p.objectives_mastered, 0) end
  from public.cohort_memberships m
  join public.learners l on l.id = m.learner_id
  left join public.learner_progress p on p.learner_id = m.learner_id
  where m.cohort_id = p_cohort and m.status = 'active'
  order by m.joined_at;
end;
$$;

-- Individual mistake history: only with the learner's explicit consent.
create or replace function public.facilitator_learner_mistakes(p_cohort uuid, p_learner uuid)
returns table (occurred_at timestamptz, lesson_id text, exercise_id text, exercise_type text, item_id text, error_type text, revision boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_cohort_facilitator(p_cohort) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.cohort_memberships m
    where m.cohort_id = p_cohort and m.learner_id = p_learner and m.status = 'active' and m.share_mistakes
  ) then
    raise exception 'learner has not consented to share mistakes' using errcode = '42501';
  end if;
  return query
  select a.occurred_at, a.lesson_id, a.exercise_id, a.exercise_type, a.item_id, a.error_type, a.revision
  from public.learning_attempts a
  where a.learner_id = p_learner and a.outcome = 'incorrect'
  order by a.occurred_at desc
  limit 200;
end;
$$;

-- AI tutor logs: only with the learner's explicit consent. Never available to org admins.
create or replace function public.facilitator_learner_tutor_logs(p_cohort uuid, p_learner uuid)
returns table (created_at timestamptz, tier smallint, language text, lesson_id text, request_text text, response_text text, clip_id text, generated boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_cohort_facilitator(p_cohort) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.cohort_memberships m
    where m.cohort_id = p_cohort and m.learner_id = p_learner and m.status = 'active' and m.share_tutor_logs
  ) then
    raise exception 'learner has not consented to share tutor questions' using errcode = '42501';
  end if;
  return query
  select t.created_at, t.tier, t.language, t.lesson_id, t.request_text, t.response_text, t.clip_id, t.generated
  from public.tutor_logs t
  where t.learner_id = p_learner
  order by t.created_at desc
  limit 200;
end;
$$;

-- Objectives most often failed in a cohort, aggregated over learners who
-- share progress. Objectives attempted by fewer than 3 learners are hidden so
-- no individual can be singled out.
create or replace function public.cohort_objective_summary(p_cohort uuid)
returns table (objective_id text, learners_attempted int, learners_with_errors int, incorrect_attempts int, total_attempts int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_cohort_facilitator(p_cohort) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  with members as (
    select m.learner_id from public.cohort_memberships m
    where m.cohort_id = p_cohort and m.status = 'active' and m.share_progress
  ),
  attempts as (
    select a.learner_id, unnest(a.objective_ids) as objective_id, a.outcome
    from public.learning_attempts a
    join members using (learner_id)
    where a.outcome <> 'practised' and a.attempt_number = 1
  )
  select
    x.objective_id,
    count(distinct x.learner_id)::int,
    (count(distinct x.learner_id) filter (where x.outcome = 'incorrect'))::int,
    (count(*) filter (where x.outcome = 'incorrect'))::int,
    count(*)::int
  from attempts x
  group by x.objective_id
  having count(distinct x.learner_id) >= 3
  order by 4 desc, 3 desc;
end;
$$;

-- Completion evidence: objectives mastered with dates and the evidence behind
-- them, for learners who consented to share mastery. Available to the cohort's
-- facilitators and to the organisation's admins.
create or replace function public.cohort_completion_evidence(p_cohort uuid)
returns table (
  learner_id uuid,
  avatar_id text,
  nickname text,
  objective_id text,
  status text,
  first_mastered_at timestamptz,
  competencies jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_cohort_facilitator(p_cohort) or public.is_cohort_org_admin(p_cohort)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select m.learner_id, l.avatar_id, l.nickname, o.objective_id, o.status, o.first_mastered_at, o.competencies
  from public.cohort_memberships m
  join public.learners l on l.id = m.learner_id
  join public.objective_mastery o on o.learner_id = m.learner_id
  where m.cohort_id = p_cohort and m.status = 'active' and m.share_mastery and o.first_mastered_at is not null
  order by l.nickname nulls last, m.learner_id, o.first_mastered_at;
end;
$$;

-- Placement and pre/post assessment results for learners sharing mastery.
create or replace function public.cohort_assessment_evidence(p_cohort uuid)
returns table (learner_id uuid, kind text, instrument text, skipped boolean, scores jsonb, placed_level smallint, completed_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_cohort_facilitator(p_cohort) or public.is_cohort_org_admin(p_cohort)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select a.learner_id, a.kind, a.instrument, a.skipped, a.scores, a.placed_level, a.completed_at
  from public.cohort_memberships m
  join public.assessment_results a on a.learner_id = m.learner_id
  where m.cohort_id = p_cohort and m.status = 'active' and m.share_mastery
  order by a.learner_id, a.completed_at;
end;
$$;

-- Aggregated statistics for organisation admins. No per-learner rows.
create or replace function public.org_cohort_summaries(p_org uuid)
returns table (
  cohort_id uuid,
  cohort_name text,
  created_at timestamptz,
  archived boolean,
  learners int,
  learners_sharing_progress int,
  active_last_7_days int,
  lessons_completed int,
  learners_sharing_mastery int,
  objectives_mastered int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_staff_role('org_admin', p_org) or public.has_staff_role('platform_admin')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select
    c.id,
    c.name,
    c.created_at,
    c.archived_at is not null,
    count(m.learner_id)::int,
    (count(m.learner_id) filter (where m.share_progress))::int,
    (count(m.learner_id) filter (where m.share_progress and p.last_active_date >= current_date - 7))::int,
    coalesce(sum(p.lessons_completed) filter (where m.share_progress), 0)::int,
    (count(m.learner_id) filter (where m.share_mastery))::int,
    coalesce(sum(p.objectives_mastered) filter (where m.share_mastery), 0)::int
  from public.cohorts c
  left join public.cohort_memberships m on m.cohort_id = c.id and m.status = 'active'
  left join public.learner_progress p on p.learner_id = m.learner_id
  where c.organisation_id = p_org
  group by c.id
  order by c.created_at;
end;
$$;

-- Opt-in, positive group milestone for learners in a cohort ("your class
-- finished 12 lessons this week"). Never individual rankings. Only shown when
-- the facilitator enabled it and at least 3 learners share progress.
create or replace function public.cohort_encouragement(p_cohort uuid)
returns table (lessons_this_week int, learners_active_this_week int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_sharing int;
begin
  if not exists (
    select 1 from public.cohort_memberships m
    where m.cohort_id = p_cohort and m.learner_id = public.current_learner_id() and m.status = 'active'
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select c.encouragement_enabled into v_enabled from public.cohorts c where c.id = p_cohort;
  select count(*) into v_sharing from public.cohort_memberships m where m.cohort_id = p_cohort and m.status = 'active' and m.share_progress;
  if not v_enabled or v_sharing < 3 then
    return;
  end if;
  return query
  select count(lc.op_id)::int, count(distinct lc.learner_id)::int
  from public.cohort_memberships m
  join public.lesson_completions lc on lc.learner_id = m.learner_id and lc.completed_at > now() - interval '7 days'
  where m.cohort_id = p_cohort and m.status = 'active' and m.share_progress;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'create_cohort(uuid, text)', 'facilitator_cohort_learners(uuid)', 'facilitator_learner_mistakes(uuid, uuid)',
    'facilitator_learner_tutor_logs(uuid, uuid)', 'cohort_objective_summary(uuid)', 'cohort_completion_evidence(uuid)',
    'cohort_assessment_evidence(uuid)', 'org_cohort_summaries(uuid)', 'cohort_encouragement(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

------------------------------------------------------------------------------
-- Server-only functions (service role). Not executable by any client role.
------------------------------------------------------------------------------

-- Store a batch of device operations idempotently. Returns which op IDs are
-- now stored for this learner and which were refused (an op ID that belongs to
-- someone else). Typed rows are written for attempts, completions and assessments.
create or replace function public.sync_ingest(p_learner uuid, p_device uuid, p_ops jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op jsonb;
  v_id uuid;
  v_owner uuid;
  v_data jsonb;
  v_accepted uuid[] := '{}';
  v_rejected uuid[] := '{}';
begin
  for v_op in select * from jsonb_array_elements(p_ops)
  loop
    v_id := (v_op ->> 'id')::uuid;
    v_data := v_op -> 'data';
    insert into public.sync_operations (op_id, learner_id, device_profile_id, op_type, payload, client_at, local_date)
    values (v_id, p_learner, p_device, v_op ->> 'type', v_data, (v_op ->> 'at')::timestamptz, (v_op ->> 'localDate')::date)
    on conflict (op_id) do nothing;
    if found then
      if v_op ->> 'type' = 'attempt' then
        insert into public.learning_attempts (
          op_id, learner_id, lesson_id, exercise_id, exercise_type, item_id, objective_ids, evidence, outcome,
          attempt_number, supported, error_type, self_check, response_ms, revision, occurred_at, local_date
        ) values (
          v_id, p_learner, v_data ->> 'lessonId', v_data ->> 'exerciseId', v_data ->> 'exerciseType', v_data ->> 'itemId',
          array(select jsonb_array_elements_text(v_data -> 'objectiveIds')), v_data -> 'evidence', v_data ->> 'outcome',
          (v_data ->> 'attemptNumber')::smallint, (v_data ->> 'supported')::boolean, v_data ->> 'errorType',
          v_data ->> 'selfCheck', (v_data ->> 'responseMs')::int, coalesce((v_data ->> 'revision')::boolean, false),
          (v_op ->> 'at')::timestamptz, (v_op ->> 'localDate')::date
        );
      elsif v_op ->> 'type' = 'lesson_complete' then
        insert into public.lesson_completions (op_id, learner_id, lesson_id, correct, total, duration_ms, data_bytes, completed_at, local_date)
        values (
          v_id, p_learner, v_data ->> 'lessonId', (v_data ->> 'correct')::int, (v_data ->> 'total')::int,
          (v_data ->> 'durationMs')::int, (v_data ->> 'dataBytes')::int, (v_op ->> 'at')::timestamptz, (v_op ->> 'localDate')::date
        );
      elsif v_op ->> 'type' = 'assessment' then
        insert into public.assessment_results (op_id, learner_id, kind, instrument, skipped, scores, placed_level, completed_at, local_date)
        values (
          v_id, p_learner, v_data ->> 'kind', v_data ->> 'instrument', (v_data ->> 'skipped')::boolean, v_data -> 'scores',
          (v_data ->> 'placedLevel')::smallint, (v_op ->> 'at')::timestamptz, (v_op ->> 'localDate')::date
        );
      end if;
      v_accepted := v_accepted || v_id;
    else
      select s.learner_id into v_owner from public.sync_operations s where s.op_id = v_id;
      if v_owner = p_learner then
        v_accepted := v_accepted || v_id;
      else
        v_rejected := v_rejected || v_id;
      end if;
    end if;
  end loop;
  update public.device_profiles set last_seen_at = now() where id = p_device and learner_id = p_learner;
  return jsonb_build_object('accepted', to_jsonb(v_accepted), 'rejected', to_jsonb(v_rejected));
end;
$$;

-- Replace the derived progress tables with a fresh recomputation, unless a
-- recomputation from a longer log has already been written.
create or replace function public.sync_write_derived(p_learner uuid, p_watermark int, p_state jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current int;
  v_progress jsonb := p_state -> 'progress';
begin
  perform pg_advisory_xact_lock(hashtext('derived:' || p_learner::text));
  select lp.ops_watermark into v_current from public.learner_progress lp where lp.learner_id = p_learner;
  if v_current is not null and v_current > p_watermark then
    return false;
  end if;

  insert into public.learner_progress as lp (
    learner_id, xp, xp_breakdown, lessons_completed, objectives_mastered, current_streak, longest_streak,
    grace_remaining, current_level, last_active_date, ops_watermark, recalculated_at
  ) values (
    p_learner, (v_progress ->> 'xp')::int, v_progress -> 'xpBreakdown', (v_progress ->> 'lessonsCompleted')::int,
    (v_progress ->> 'objectivesMastered')::int, (v_progress ->> 'currentStreak')::int, (v_progress ->> 'longestStreak')::int,
    (v_progress ->> 'graceRemaining')::int, (v_progress ->> 'currentLevel')::smallint, (v_progress ->> 'lastActiveDate')::date,
    p_watermark, now()
  )
  on conflict (learner_id) do update set
    xp = excluded.xp, xp_breakdown = excluded.xp_breakdown, lessons_completed = excluded.lessons_completed,
    objectives_mastered = excluded.objectives_mastered, current_streak = excluded.current_streak,
    longest_streak = excluded.longest_streak, grace_remaining = excluded.grace_remaining,
    current_level = excluded.current_level, last_active_date = excluded.last_active_date,
    ops_watermark = excluded.ops_watermark, recalculated_at = now();

  delete from public.objective_mastery where learner_id = p_learner;
  insert into public.objective_mastery (learner_id, objective_id, status, first_mastered_at, competencies)
  select p_learner, x.objective_id, x.status, x.first_mastered_at, x.competencies
  from jsonb_to_recordset(coalesce(p_state -> 'objectives', '[]'::jsonb))
    as x(objective_id text, status text, first_mastered_at timestamptz, competencies jsonb);

  delete from public.learner_achievements where learner_id = p_learner;
  insert into public.learner_achievements (learner_id, badge_id, earned_at)
  select p_learner, x.badge_id, x.earned_at
  from jsonb_to_recordset(coalesce(p_state -> 'badges', '[]'::jsonb)) as x(badge_id text, earned_at timestamptz);

  delete from public.streak_days where learner_id = p_learner;
  insert into public.streak_days (learner_id, local_date, kind)
  select p_learner, x.local_date, x.kind
  from jsonb_to_recordset(coalesce(p_state -> 'streakDays', '[]'::jsonb)) as x(local_date date, kind text);

  delete from public.revision_schedule where learner_id = p_learner;
  insert into public.revision_schedule (learner_id, exercise_id, lesson_id, item_id, objective_ids, box, due_date, last_outcome, lapses, last_failed_decode_date)
  select p_learner, x.exercise_id, x.lesson_id, x.item_id, x.objective_ids, x.box, x.due_date, x.last_outcome, x.lapses, x.last_failed_decode_date
  from jsonb_to_recordset(coalesce(p_state -> 'revision', '[]'::jsonb))
    as x(exercise_id text, lesson_id text, item_id text, objective_ids text[], box smallint, due_date date, last_outcome text, lapses int, last_failed_decode_date date);

  update public.learners
  set current_level = (v_progress ->> 'currentLevel')::smallint,
      last_active_date = (v_progress ->> 'lastActiveDate')::date,
      updated_at = now()
  where id = p_learner;
  return true;
end;
$$;

-- Join a cohort with a 6-digit code, recording the sharing consent.
create or replace function public.join_cohort(p_learner uuid, p_code text, p_share jsonb, p_version text, p_language text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cohort public.cohorts;
  v_failures int;
begin
  select count(*) into v_failures from public.join_attempts j
  where j.learner_id = p_learner and not j.succeeded and j.created_at > now() - interval '1 hour';
  if v_failures >= 10 then
    return jsonb_build_object('error', 'rate_limited');
  end if;
  select * into v_cohort from public.cohorts c where c.join_code = p_code and c.join_open and c.archived_at is null;
  if not found then
    insert into public.join_attempts (learner_id, succeeded) values (p_learner, false);
    return jsonb_build_object('error', 'not_found');
  end if;
  insert into public.join_attempts (learner_id, succeeded) values (p_learner, true);
  insert into public.cohort_memberships as m (cohort_id, learner_id, status, share_progress, share_mastery, share_mistakes, share_tutor_logs)
  values (
    v_cohort.id, p_learner, 'active', true,
    coalesce((p_share ->> 'mastery')::boolean, false),
    coalesce((p_share ->> 'mistakes')::boolean, false),
    coalesce((p_share ->> 'tutorLogs')::boolean, false)
  )
  on conflict (cohort_id, learner_id) do update set
    status = 'active', share_progress = true, share_mastery = excluded.share_mastery,
    share_mistakes = excluded.share_mistakes, share_tutor_logs = excluded.share_tutor_logs,
    joined_at = now(), withdrawn_at = null;
  update public.consent_records set withdrawn_at = now()
  where learner_id = p_learner and cohort_id = v_cohort.id and consent_type = 'cohort_sharing' and withdrawn_at is null;
  insert into public.consent_records (learner_id, consent_type, cohort_id, scope, version, language)
  values (
    p_learner, 'cohort_sharing', v_cohort.id,
    jsonb_build_object(
      'progress', true,
      'mastery', coalesce((p_share ->> 'mastery')::boolean, false),
      'mistakes', coalesce((p_share ->> 'mistakes')::boolean, false),
      'tutorLogs', coalesce((p_share ->> 'tutorLogs')::boolean, false)
    ),
    p_version, p_language
  );
  return jsonb_build_object('cohortId', v_cohort.id, 'name', v_cohort.name);
end;
$$;

-- Change what is shared with a cohort. Sharing nothing at all withdraws from
-- the cohort. Takes effect immediately for every facilitator query.
create or replace function public.update_cohort_sharing(p_learner uuid, p_cohort uuid, p_share jsonb, p_version text, p_language text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_progress boolean := coalesce((p_share ->> 'progress')::boolean, false);
begin
  if not exists (select 1 from public.cohort_memberships m where m.cohort_id = p_cohort and m.learner_id = p_learner and m.status = 'active') then
    return 'not_member';
  end if;
  update public.consent_records set withdrawn_at = now()
  where learner_id = p_learner and cohort_id = p_cohort and consent_type = 'cohort_sharing' and withdrawn_at is null;
  if not v_progress then
    update public.cohort_memberships
    set status = 'withdrawn', share_progress = false, share_mastery = false, share_mistakes = false, share_tutor_logs = false, withdrawn_at = now()
    where cohort_id = p_cohort and learner_id = p_learner;
    return 'withdrawn';
  end if;
  update public.cohort_memberships
  set share_mastery = coalesce((p_share ->> 'mastery')::boolean, false),
      share_mistakes = coalesce((p_share ->> 'mistakes')::boolean, false),
      share_tutor_logs = coalesce((p_share ->> 'tutorLogs')::boolean, false)
  where cohort_id = p_cohort and learner_id = p_learner;
  insert into public.consent_records (learner_id, consent_type, cohort_id, scope, version, language)
  values (p_learner, 'cohort_sharing', p_cohort, p_share || jsonb_build_object('progress', true), p_version, p_language);
  return 'updated';
end;
$$;

-- Delete a learner and everything linked to them, including pseudonymous
-- analytics and error logs. The Supabase Auth user is deleted by the API.
create or replace function public.delete_learner(p_learner uuid, p_initiated_by text default 'learner')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pseudonym text;
begin
  select l.pseudonym into v_pseudonym from public.learners l where l.id = p_learner;
  if not found then
    return false;
  end if;
  delete from public.analytics_events where pseudonym = v_pseudonym;
  delete from public.error_logs where pseudonym = v_pseudonym;
  delete from public.learners where id = p_learner;
  insert into public.deletion_log (initiated_by) values (p_initiated_by);
  return true;
end;
$$;

-- Per-learner tutor rate limit. Records the request when allowed.
create or replace function public.tutor_rate_check(p_learner uuid, p_tier smallint, p_per_minute int, p_per_day int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('tutor:' || p_learner::text));
  if (select count(*) from public.tutor_requests r where r.learner_id = p_learner and r.created_at > now() - interval '1 minute') >= p_per_minute then
    return false;
  end if;
  if (select count(*) from public.tutor_requests r where r.learner_id = p_learner and r.created_at > now() - interval '1 day') >= p_per_day then
    return false;
  end if;
  insert into public.tutor_requests (learner_id, tier) values (p_learner, p_tier);
  return true;
end;
$$;

-- Global daily AI spending cap: reserve the estimated cost before calling a
-- provider; refuse when the reservation would exceed the cap.
create or replace function public.ai_reserve_spend(p_day date, p_estimate numeric, p_cap numeric)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ai_spend_daily (day) values (p_day) on conflict (day) do nothing;
  update public.ai_spend_daily
  set spent_usd = spent_usd + p_estimate, requests = requests + 1
  where day = p_day and spent_usd + p_estimate <= p_cap;
  return found;
end;
$$;

-- Correct a reservation once the real cost is known (delta may be negative).
create or replace function public.ai_settle_spend(p_day date, p_delta numeric)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_spend_daily set spent_usd = greatest(0, spent_usd + p_delta) where day = p_day;
$$;

-- Retention: delete expired records. Scheduled daily with pg_cron when available
-- (see below) and also callable from /api/cron/purge.
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
  return v_result;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'sync_ingest(uuid, uuid, jsonb)', 'sync_write_derived(uuid, int, jsonb)', 'join_cohort(uuid, text, jsonb, text, text)',
    'update_cohort_sharing(uuid, uuid, jsonb, text, text)', 'delete_learner(uuid, text)',
    'tutor_rate_check(uuid, smallint, int, int)', 'ai_reserve_spend(date, numeric, numeric)', 'ai_settle_spend(date, numeric)',
    'purge_expired()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

------------------------------------------------------------------------------
-- Daily retention job (pg_cron is available on Supabase; skipped elsewhere)
------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('yomu-purge-expired', '17 1 * * *', 'select public.purge_expired()');
  end if;
exception when others then
  raise notice 'pg_cron not scheduled: %', sqlerrm;
end $$;
