# Deploying Yomu (Supabase + Vercel)

The app runs on Vercel; its data lives in Supabase in Frankfurt (`eu-central-1`). `vercel.json` already puts the server functions in Frankfurt (`fra1`, next to the database) and schedules the daily retention job. The build needs no ffmpeg (placeholder audio is committed), and CI builds exactly as Vercel does.

## 1. Database (Supabase)

Skip any step already done for you.

1. **Project:** a new project in Frankfurt (`eu-central-1`), separate from other projects. Use the Pro plan for the pilot: free projects pause after 7 days without activity and have no downloadable backups.
2. **Schema:** from a checkout of `main`, with the Supabase CLI logged in:
   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push        # applies supabase/migrations in order
   ```
3. **Auth settings** (Dashboard → Authentication). These are not copied from `supabase/config.toml`:
   - Sign In / Providers → **Allow anonymous sign-ins: on** (learners register this way).
   - Sign In / Providers → Email → **Confirm email: on** (the default).
   - Multi-Factor → **Authenticator app (TOTP): enabled** (staff need it).
   - Rate Limits → **Anonymous sign-ins: about 300 per hour**. The default of 30 per IP address is too low when a whole class registers on one Wi-Fi network or behind a mobile network's shared address.
4. **Lessons** (for the staff review tool and reports; learners do not need it). Run from a checkout of `main`, with the project's values:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co \
   SUPABASE_SECRET_KEY=<secret key> \
   npm run db:seed-content -- --allow-remote
   ```
5. **Staff accounts.** For each person: Authentication → Users → Add user → email and password, **Auto Confirm User** ticked. Then, in the SQL editor:
   ```sql
   -- once: the organisation that runs the classes ('employer', 'ngo', 'cet_college', 'aet_provider', 'government' or 'other')
   insert into public.organisations (name, kind) values ('Organisation name', 'ngo') returning id;

   -- platform administrator (at least two, so one can reset the other's two-step sign-in)
   insert into public.staff_roles (user_id, role, display_name)
   select id, 'platform_admin', 'Name' from auth.users where email = 'person@example.org';

   -- facilitator or organisation admin ('facilitator' / 'org_admin'), with the organisation id from above
   insert into public.staff_roles (user_id, role, organisation_id, display_name)
   select id, 'facilitator', '<organisation id>', 'Name' from auth.users where email = 'person@example.org';
   ```
   At their first sign-in at `/staff`, each person sets up an authenticator app and saves their recovery codes.

**Never run `npm run db:seed-dev` against this project**: it creates staff accounts with a published password.

## 2. Vercel

1. **Import** the GitHub repository. Vercel detects Next.js; keep the default build settings. Production branch: `main`.
2. **Environment variables** (Settings → Environment Variables, for Production) before the first deploy:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Settings → API Keys → publishable key (`sb_publishable_…`) |
   | `SUPABASE_SECRET_KEY` | the secret key (`sb_secret_…`); server only, never prefixed with `NEXT_PUBLIC_` |
   | `PIN_PEPPER` | 48 random characters, e.g. from `openssl rand -base64 48`. Keep a copy somewhere safe and **never change it**: changing it breaks every learner's code on the server and every staff recovery code |
   | `CRON_SECRET` | another `openssl rand -base64 48`; Vercel sends it to the daily retention job |
   | `AI_STT_PROVIDER` | `none` |
   | `AI_LLM_PROVIDER` | `none` |

   Leave `DEV_TOOLS_ENABLED` and `HIDE_UNAPPROVED_CONTENT` unset. Setting `HIDE_UNAPPROVED_CONTENT` hides every lesson until lines are approved.
3. **Deploy.** Variables starting with `NEXT_PUBLIC_` are built into the app, so after changing one, redeploy.

## 3. Check the live site

1. `https://<your domain>/api/health` answers `{"ok":true,"backend":true,…}`.
2. On a phone: choose a language, make a picture and code, save online (the spoken consent plays first), and do a lesson. In Supabase, `public.learners` has one row.
3. At `/staff`: sign in with a staff account, set up the authenticator, create a class, and join it from the phone with its code.
4. Delete the test learner on the phone (Me → Privacy → press and hold "delete everything"). Its row is gone.
5. Supabase → Integrations → Cron (or `select jobname, schedule from cron.job;`) lists `yomu-purge-expired`. Vercel → Settings → Cron Jobs lists `/api/cron/purge`. Either one keeps retention running.

## Later changes

- **New or changed lesson lines:** run `npm run content:build` where ffmpeg is installed and commit `public/audio/placeholder/` (CI fails until you do). Recordings imported with `npm run audio:import` replace placeholders.
- **Database changes:** add a migration under `supabase/migrations/` and run `npx supabase db push` after the code is merged.
