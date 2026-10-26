-- Yomu core schema.
--
-- Privacy by default (POPIA): learners are identified by a device-chosen
-- picture and a hashed PIN. No name, phone number or email is required, and
-- no audio is ever stored. Every learner-owned row cascades on deletion.
-- See docs/data-inventory.md for what each table holds, why, who can see it
-- and how long it is kept.

create extension if not exists pgcrypto with schema extensions;

------------------------------------------------------------------------------
-- Organisations, staff and cohorts
------------------------------------------------------------------------------

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  kind text not null check (kind in ('employer', 'ngo', 'cet_college', 'aet_provider', 'government', 'other')),
  created_at timestamptz not null default now()
);
comment on table public.organisations is 'Sponsors that run cohorts (employers, NGOs, CET colleges, AET providers). No billing in the MVP.';

create table public.staff_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('facilitator', 'org_admin', 'content_reviewer', 'platform_admin')),
  organisation_id uuid references public.organisations (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  constraint staff_roles_org_scope check ((role in ('facilitator', 'org_admin')) = (organisation_id is not null))
);
create unique index staff_roles_unique on public.staff_roles (user_id, role, coalesce(organisation_id, '00000000-0000-0000-0000-000000000000'::uuid));
comment on table public.staff_roles is 'Literate staff accounts (email sign-in). Assigned by a platform admin.';

create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  join_code text not null unique check (join_code ~ '^[0-9]{6}$'),
  join_open boolean not null default true,
  encouragement_enabled boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.cohort_facilitators (
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (cohort_id, user_id)
);

------------------------------------------------------------------------------
-- Learners
------------------------------------------------------------------------------

create table public.learners (
  id uuid primary key default gen_random_uuid(),
  -- The Supabase Auth user currently holding this learner (an anonymous user
  -- created on the learner's device after spoken consent). Re-bound when a
  -- facilitator helps move the learner to a new phone.
  auth_user_id uuid unique references auth.users (id) on delete set null,
  teaching_language text not null check (teaching_language in ('zu', 'st')),
  avatar_id text not null check (avatar_id ~ '^avatar-[a-z]+$'),
  nickname text check (nickname is null or char_length(nickname) <= 40),
  current_level smallint not null default 0 check (current_level between 0 and 5),
  -- Random identifier used for analytics and AI requests instead of the learner ID.
  pseudonym text not null unique default ('l_' || encode(extensions.gen_random_bytes(9), 'hex')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_active_date date
);
comment on table public.learners is 'One row per registered learner. Optional nickname; no name, phone or email stored here.';

create table public.learner_credentials (
  learner_id uuid primary key references public.learners (id) on delete cascade,
  pin_hash text not null,
  failed_attempts int not null default 0,
  retry_after timestamptz,
  updated_at timestamptz not null default now()
);
comment on table public.learner_credentials is 'Salted scrypt hash of the picture PIN. Server only; never readable by any client role.';

create table public.device_profiles (
  id uuid primary key,
  learner_id uuid not null references public.learners (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
comment on table public.device_profiles is 'Links a device-local profile (shared phones have several) to its server learner.';

create table public.cohort_memberships (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  learner_id uuid not null references public.learners (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'withdrawn')),
  -- What the learner consented to share with this cohort's facilitators.
  share_progress boolean not null default true,
  share_mastery boolean not null default false,
  share_mistakes boolean not null default false,
  share_tutor_logs boolean not null default false,
  joined_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  unique (cohort_id, learner_id)
);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners (id) on delete cascade,
  consent_type text not null check (consent_type in ('account_storage', 'cohort_sharing', 'analytics', 'pilot_research')),
  cohort_id uuid references public.cohorts (id) on delete set null,
  scope jsonb not null default '{}'::jsonb,
  version text not null,
  language text not null check (language in ('zu', 'st')),
  method text not null default 'spoken_explanation_button',
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
comment on table public.consent_records is 'Consent given after a spoken explanation: type, scope, script version, language and time; withdrawal time when withdrawn.';

create table public.facilitator_assists (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners (id) on delete cascade,
  facilitator_user_id uuid references auth.users (id) on delete set null,
  cohort_id uuid references public.cohorts (id) on delete set null,
  action text not null check (action in ('pin_reset', 'device_transfer')),
  created_at timestamptz not null default now()
);
comment on table public.facilitator_assists is 'Audit trail of facilitator help on a learner''s device. The PIN itself is never visible to the facilitator.';

------------------------------------------------------------------------------
-- Curriculum (seeded from content/ by scripts/seed-content.ts)
------------------------------------------------------------------------------

create table public.content_versions (
  id text primary key,
  seeded_at timestamptz not null default now(),
  lesson_count int not null,
  asset_count int not null
);

create table public.curriculum_levels (
  level smallint primary key check (level between 0 and 5),
  title text not null,
  description text not null,
  aet_level text not null
);

create table public.units (
  id text primary key,
  level smallint not null references public.curriculum_levels (level),
  sort_order int not null,
  title_en text not null
);

create table public.lessons (
  id text primary key,
  unit_id text not null references public.units (id),
  level smallint not null references public.curriculum_levels (level),
  sort_order int not null,
  version int not null,
  title_en text not null,
  summary text not null,
  target text not null check (target in ('en', 'home')),
  minutes int not null,
  prerequisites text[] not null default '{}',
  contrastive_tags text[] not null default '{}',
  content jsonb not null,
  content_version text not null references public.content_versions (id)
);

create table public.learning_objectives (
  id text primary key,
  lesson_id text not null references public.lessons (id) on delete cascade,
  description text not null,
  strand text not null,
  mastery_competencies text[] not null,
  reading boolean not null,
  contrastive_tags text[] not null default '{}'
);

create table public.exercises (
  id text primary key,
  lesson_id text not null references public.lessons (id) on delete cascade,
  type text not null,
  mode text,
  objective_ids text[] not null,
  evidence jsonb not null,
  pathways text[] not null,
  definition jsonb not null
);

create table public.aet_outcomes (
  id text primary key,
  level text not null,
  learning_area text not null,
  outcome text not null,
  official_reference text,
  status text not null check (status in ('proposed_unreviewed', 'specialist_reviewed'))
);

create table public.aet_mappings (
  objective_id text not null references public.learning_objectives (id) on delete cascade,
  outcome_id text not null references public.aet_outcomes (id),
  aet_level text not null,
  review_status text not null default 'proposed_unreviewed' check (review_status in ('proposed_unreviewed', 'specialist_reviewed')),
  primary key (objective_id, outcome_id)
);

create table public.content_assets (
  id text primary key,
  kind text not null,
  language text not null check (language in ('zu', 'st', 'en')),
  text text not null,
  context_note text,
  usage text not null,
  lesson_id text,
  review_status text not null check (review_status in ('draft', 'native_speaker_reviewed', 'educator_reviewed', 'approved')),
  audio_url text,
  audio_placeholder boolean not null default true,
  content_version text not null references public.content_versions (id),
  updated_at timestamptz not null default now()
);
comment on table public.content_assets is 'Every spoken line (script text, translation and audio) with its review status.';

create table public.content_reviews (
  id uuid primary key default gen_random_uuid(),
  asset_id text not null references public.content_assets (id) on delete cascade,
  status text not null check (status in ('draft', 'native_speaker_reviewed', 'educator_reviewed', 'approved')),
  reviewer_role text not null check (reviewer_role in ('native_speaker', 'adult_literacy_educator', 'linguist', 'aet_specialist', 'voice_director')),
  reviewer_user_id uuid references auth.users (id) on delete set null,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);
comment on table public.content_reviews is 'Review decisions. Reviewer role and date only; no other reviewer personal data.';

create table public.provider_capabilities (
  provider text not null,
  language text not null check (language in ('zu', 'st', 'en')),
  capability text not null check (capability in ('stt', 'tts', 'translation', 'pronunciation_scoring', 'llm_dialogue')),
  status text not null check (status in ('verified', 'experimental', 'unsupported')),
  verified_at date,
  verifier_role text,
  learner_visible boolean not null default false,
  notes text not null,
  matrix_version text not null,
  primary key (provider, language, capability),
  constraint provider_capabilities_visible_only_if_verified check (not learner_visible or status = 'verified')
);
comment on table public.provider_capabilities is 'Copy of config/capabilities.json for audit and reporting. The app reads the file at runtime.';

------------------------------------------------------------------------------
-- Learning records (raw, from the offline operation log)
------------------------------------------------------------------------------

create table public.sync_operations (
  op_id uuid primary key,
  seq bigint generated always as identity unique,
  learner_id uuid not null references public.learners (id) on delete cascade,
  device_profile_id uuid,
  op_type text not null check (op_type in ('attempt', 'lesson_complete', 'lesson_progress', 'assessment', 'level_change')),
  payload jsonb not null,
  client_at timestamptz not null,
  local_date date not null,
  received_at timestamptz not null default now()
);
create index sync_operations_learner_seq on public.sync_operations (learner_id, seq);
comment on table public.sync_operations is 'Append-only log of learner activity. op_id is the device-generated idempotency key.';

create table public.learning_attempts (
  op_id uuid primary key references public.sync_operations (op_id) on delete cascade,
  learner_id uuid not null references public.learners (id) on delete cascade,
  lesson_id text not null,
  exercise_id text not null,
  exercise_type text not null,
  item_id text not null,
  objective_ids text[] not null,
  evidence jsonb not null,
  outcome text not null check (outcome in ('correct', 'incorrect', 'practised')),
  attempt_number smallint not null,
  supported boolean not null,
  error_type text,
  self_check text,
  response_ms int,
  revision boolean not null default false,
  occurred_at timestamptz not null,
  local_date date not null
);
create index learning_attempts_learner_time on public.learning_attempts (learner_id, occurred_at);
create index learning_attempts_objectives on public.learning_attempts using gin (objective_ids);

create table public.lesson_completions (
  op_id uuid primary key references public.sync_operations (op_id) on delete cascade,
  learner_id uuid not null references public.learners (id) on delete cascade,
  lesson_id text not null,
  correct int not null,
  total int not null,
  duration_ms int not null,
  data_bytes int,
  completed_at timestamptz not null,
  local_date date not null
);
create index lesson_completions_learner on public.lesson_completions (learner_id, completed_at);

create table public.assessment_results (
  op_id uuid primary key references public.sync_operations (op_id) on delete cascade,
  learner_id uuid not null references public.learners (id) on delete cascade,
  kind text not null check (kind in ('placement', 'pre', 'post', 'retake')),
  instrument text not null,
  skipped boolean not null,
  scores jsonb not null,
  placed_level smallint not null,
  completed_at timestamptz not null,
  local_date date not null
);

------------------------------------------------------------------------------
-- Derived progress (written only by the server's recomputation)
------------------------------------------------------------------------------

create table public.learner_progress (
  learner_id uuid primary key references public.learners (id) on delete cascade,
  xp int not null default 0,
  xp_breakdown jsonb not null default '{}'::jsonb,
  lessons_completed int not null default 0,
  objectives_mastered int not null default 0,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  grace_remaining int not null default 0,
  current_level smallint not null default 0,
  last_active_date date,
  -- Number of ops the derivation was computed from; a recomputation from a
  -- smaller log (an older, concurrent request) never overwrites a newer one.
  ops_watermark int not null default 0,
  recalculated_at timestamptz not null default now()
);

create table public.objective_mastery (
  learner_id uuid not null references public.learners (id) on delete cascade,
  objective_id text not null,
  status text not null check (status in ('not_started', 'practised', 'developing', 'mastered', 'needs_review')),
  first_mastered_at timestamptz,
  competencies jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (learner_id, objective_id)
);

create table public.learner_achievements (
  learner_id uuid not null references public.learners (id) on delete cascade,
  badge_id text not null,
  earned_at timestamptz not null,
  primary key (learner_id, badge_id)
);

create table public.streak_days (
  learner_id uuid not null references public.learners (id) on delete cascade,
  local_date date not null,
  kind text not null check (kind in ('active', 'grace')),
  primary key (learner_id, local_date)
);

create table public.revision_schedule (
  learner_id uuid not null references public.learners (id) on delete cascade,
  exercise_id text not null,
  lesson_id text not null,
  item_id text not null,
  objective_ids text[] not null,
  box smallint not null check (box between 1 and 5),
  due_date date not null,
  last_outcome text not null check (last_outcome in ('correct', 'incorrect')),
  lapses int not null default 0,
  last_failed_decode_date date,
  primary key (learner_id, exercise_id)
);

------------------------------------------------------------------------------
-- AI tutor, analytics, errors
------------------------------------------------------------------------------

create table public.tutor_requests (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners (id) on delete cascade,
  tier smallint not null,
  created_at timestamptz not null default now()
);
create index tutor_requests_learner_time on public.tutor_requests (learner_id, created_at);
comment on table public.tutor_requests is 'Timestamps only, for per-learner rate limits. Kept 2 days.';

create table public.tutor_logs (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners (id) on delete cascade,
  tier smallint not null check (tier in (2, 3)),
  language text not null check (language in ('zu', 'st')),
  lesson_id text,
  exercise_id text,
  request_text text check (request_text is null or char_length(request_text) <= 1000),
  response_text text check (response_text is null or char_length(response_text) <= 4000),
  intent text,
  clip_id text,
  provider text,
  generated boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index tutor_logs_expiry on public.tutor_logs (expires_at);
comment on table public.tutor_logs is 'Text of AI tutor requests and responses for quality review. Never audio. Deleted at expires_at. Excluded from employer reports.';

create table public.tutor_unanswered_intents (
  id uuid primary key default gen_random_uuid(),
  language text not null check (language in ('zu', 'st')),
  lesson_id text,
  exercise_id text,
  transcript text not null check (char_length(transcript) <= 500),
  classified_intent text,
  created_at timestamptz not null default now()
);
comment on table public.tutor_unanswered_intents is 'Questions the tutor had no validated clip for, as text, without any learner identifier. For content authors.';

create table public.ai_spend_daily (
  day date primary key,
  spent_usd numeric(12, 6) not null default 0,
  requests int not null default 0
);

create table public.analytics_events (
  id bigint generated always as identity primary key,
  event text not null check (event ~ '^[a-z_]{2,40}$'),
  pseudonym text,
  props jsonb not null default '{}'::jsonb,
  client_at timestamptz,
  received_at timestamptz not null default now()
);
create index analytics_events_event_time on public.analytics_events (event, received_at);
create index analytics_events_pseudonym on public.analytics_events (pseudonym);

create table public.error_logs (
  id bigint generated always as identity primary key,
  message text not null check (char_length(message) <= 500),
  context jsonb not null default '{}'::jsonb,
  pseudonym text,
  build_id text,
  created_at timestamptz not null default now()
);

create table public.deletion_log (
  id bigint generated always as identity primary key,
  deleted_at timestamptz not null default now(),
  initiated_by text not null check (initiated_by in ('learner', 'platform_admin', 'retention'))
);
comment on table public.deletion_log is 'That a deletion happened and who started it. Deliberately holds no identifier of the deleted learner.';

create table public.join_attempts (
  id bigint generated always as identity primary key,
  learner_id uuid not null references public.learners (id) on delete cascade,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);
comment on table public.join_attempts is 'Rate-limits guessing of cohort join codes. Kept 2 days.';
