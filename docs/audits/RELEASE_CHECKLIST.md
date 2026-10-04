# Release checklist (tick-box version)

The full explanations, commands and recovery steps are in `PRODUCTION_READINESS.md` §D and §F. Step numbers here match it.

> **This replaces the first-pass checklist.** That version ran the migration before deploying a build that couldn't log in, relied on a restore that left functions open to `anon`, and capped bookings at 3 per phone. All three are fixed in this release candidate.

**Stop rule:** if any box can't be ticked as written, stop and follow `PRODUCTION_READINESS.md` §F.

## Before the release day (owner decisions)
- [ ] **Hosting:** eligible plan chosen. Vercel Hobby is non-commercial only (§G).
- [ ] **Admin host:** host chosen for `ADMIN_HOSTS` in Production (§E3).
- [ ] **Privacy page:** contact channel and wording approved (§E4).
- [ ] **Tools:** WSL Ubuntu with `postgresql-client-17` is installed (for backups). Node ≥ 20 is available in PowerShell.

## Release
- [ ] **D1** `bash scripts/db-backup.sh backup production` (WSL) prints `Sauvegarde vérifiée`. The files are copied somewhere private and encrypted.
- [ ] **D2** Preview Supabase project created:
  - [ ] `supabase/migration.sql` and `supabase/migrations/20261004120000_security_hardening.sql` run;
  - [ ] labelled `preview`;
  - [ ] test passwords set;
  - [ ] `release_preflight('pre-deploy')` returns ok.
- [ ] **D3** Vercel variables split between Production and Preview. `DATA_ENVIRONMENT` and `ADMIN_HOSTS` set. `npm run preflight -- separation <prod-url> <preview-url>` exits with code 0.
- [ ] **D4** Production migration run in the SQL Editor. NOTICEs noted. Label `production` inserted.
- [ ] **D5** `npm run set-password -- <id>` run for `3ebchi`, `achref`, `brag` and `imed`; each block pasted into the SQL Editor; terminal cleared.
- [ ] **D6** `select public.release_preflight('pre-deploy');` returns `"ok": true` on production.
- [ ] **D7** Pushed to `preview`. Preview smoke test passed (booking, LIVE, `/confidentialite`, `/barber` login and logout). Merged to `main`.
- [ ] **D8** Production smoke tests passed:
  - [ ] home, intro and LIVE;
  - [ ] test booking made, then cancelled;
  - [ ] owner and one staff member log in; a wrong password shows the error;
  - [ ] headers present and cookie flags correct;
  - [ ] `x-vercel-cache` HIT or STALE on `/api/next-slots`;
  - [ ] no CSP errors;
  - [ ] no `data environment check failed` in the logs.
- [ ] **D9** `supabase/release/post_cutover_cleanup.sql` run the same day. It ends with `release_preflight('post-cutover')` returning ok.
- [ ] **D10** Backup taken again. A regular (at least weekly) backup routine is agreed.
