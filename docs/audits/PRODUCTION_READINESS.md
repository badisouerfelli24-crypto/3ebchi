# Production readiness: 3EBCHI STYLE release candidate

- **Date:** 2026-10-04
- **Branch / state:** working tree of `preview`, **uncommitted, not pushed, not deployed**.
- **Related documents:**
  - original audit: `SECURITY_DATABASE_AUDIT.md` (unchanged);
  - detailed change record: `REMEDIATION_REPORT.md`;
  - tick-box version of §D: `RELEASE_CHECKLIST.md`.

## Verdict

**CODE READY; EXTERNAL PREREQUISITES STILL REQUIRED.**

The code, migration, tooling and tests are complete and pass locally. The site is **not** ready to publish, for four reasons, each detailed in §E:

1. Preview and Production share the same Supabase project and keys (confirmed read-only). A Preview project has to be created first.
2. The new migration, environment label and passwords are not on the production database yet. That is your coordinated release, §D.
3. Vercel's Hobby plan forbids commercial use, and this is a business site. The current plan couldn't be read through the API.
4. The privacy contact and retention period need your confirmation.

---

## Live state (updated during the release)

- **Dashboard merged.** The new hajem dashboard (commit `8209846`: stats, agenda, outcomes, push notifications) is merged with this release. Its routes now use the password sessions (`lib/dashboard/session.ts`). The two state-changing routes (`outcome`, `push`) got the same-origin and body-size checks. All suites pass on the merged code.
- **Production database.**
  - Done:
    - safety copy in schema `backup_20261004` (not exposed by the API);
    - new tables and columns created;
    - `admin_session_revoke` created;
    - label `production` set.
  - **Still missing:** the remaining functions. The Supabase tool used here waits for an on-screen approval for any SQL containing `delete`. → **Run the whole migration file in the SQL Editor** (safe to rerun), then set the passwords (§D5).
- **Vercel.** `DATA_ENVIRONMENT=production` and `ADMIN_HOSTS=3ebchi-style.vercel.app` are set for Production only. The admin moves to `https://3ebchi-style.vercel.app/barber`. Push notifications stay "not configured" until the three `VAPID_*` variables are added (optional).
- **Code.** Committed locally and **not pushed** until the database step is done.

## A. Findings: closure and remaining exceptions

| ID | Status | Remaining exception |
|---|---|---|
| F-01 PIN login | **Closed in code.** Long passwords (scrypt), a password screen, a shared database limiter that fails closed, and a bounded hashing queue. | Real passwords are entered by you during the release (§D5). Old PIN hashes stay until the post-cutover cleanup (§D9). |
| F-02 Server-side booking rules | **Closed.** | None. |
| F-03 Booking flood | **Mitigated.** 6 valid bookings per address per 10 minutes, shared across instances; honeypot. | An address-based limit can't stop spam spread over many addresses. Customers on the same Wi-Fi share the quota. No CAPTCHA, by design. |
| F-04 Preview uses production data | **Code safeguard closed:** `DATA_ENVIRONMENT` must match the label stored in the database. | **Open externally.** Preview must get its own Supabase project and keys (§D2–D3). Until then, the new code makes Preview deployments refuse database access. |
| F-05 Sessions can't be revoked | **Closed.** | None. |
| F-06 Security headers | **Closed.** | The CSP allows `'unsafe-inline'` scripts. Next 15 has no supported hash or static CSP for its per-page inline scripts; nonces would make every page dynamic. The only inline script we wrote is a constant in `app/layout.tsx`. This limits XSS impact but doesn't prevent it entirely. |
| F-07 Block/booking race | **Closed** (shared per-barber lock). | During the window between the migration and the deploy, the **old** app still uses the old function, which has this race. |
| F-08 Ghost booking after timeout | **Closed** (idempotency key; replays are free under the limiter). | None. |
| F-09 Silent dashboard failures | **Closed.** | None. |
| F-10 Database trusts its caller | **Closed:** CHECK constraints, narrow functions, `service_role` only. | Historical rows that break a new CHECK are kept, and that constraint stays `NOT VALID`. The preflight lists them. Reviewing those rows is optional. |
| F-11 Extensions in public | **Closed locally.** The migration moves them. | Confirm on production with the preflight (check "btree_gist/pgcrypto not in public"). |
| F-12 Retention / notice | **Partly closed:** factual `/confidentialite` page, plus a footer link and one line on the confirm step. | **Owner decisions:** retention period, privacy contact channel, legal identity and Tunisian INPDP obligations. Nothing is deleted automatically today, and the page says so. |
| F-13 Minor items | **Closed.** | None. |
| Restore permissions defect | **Closed.** The restore is a single transaction that applies canonical permissions and validates them before COMMIT. | None. |
| Dependencies | `sharp` **fixed** (0.35.5). | `postcss` 8.4.31 is pinned inside every `next@15.x`; the fix is Next 16 (major). It's reachable only by processing attacker-controlled CSS at build time; this repo builds only its own CSS. It would matter if the app ever processed user-supplied CSS. `braces` is dev/build-time only (via Tailwind 3's `chokidar`). |
| R-1 Polling | **Closed.** 0 requests in hidden tabs and when the widget is off-screen; a 30-second shared CDN cache. | CDN cache behaviour to be checked after deployment. |
| R-2 Intro frames | **Closed.** First load uses 34 frames instead of 408. | None. |
| Hosting eligibility | **Open** (§G). | Plan decision. |

## B. Tests run and their outcomes

All tests ran locally on a disposable PostgreSQL 16 cluster with synthetic data, against `next start` production builds. No hosted service was contacted, except read-only listing of the Supabase project and of Vercel variable **names**.

| Test | Result |
|---|---|
| `npm run typecheck` | **Pass** |
| `next build` (with `DATA_ENVIRONMENT=test`) | **Pass**, including the new `/confidentialite` route. |
| `tests/db/db.test.mjs` (fresh install) | **14/14.** Covers: 20 simultaneous same-barber bookings giving exactly 1; different barbers not blocking each other; the C6 block/booking race; idempotency; the optional phone cap; replays not counted by the limiter; limiter expiry; sessions; staff not touching other barbers' rows; CHECK constraints; housekeeping. |
| `tests/db/migration.test.mjs` | **7/7.** Covers: upgrade from the audited schema with PINs, completed, cancelled and legacy-invalid rows (all kept); a rerun is a no-op; the **old app works on the new schema**; the provisioning SQL is atomic, revokes sessions and keeps IDs; preflight gating; the cleanup refuses until the owner has logged in with a password; fresh install; a lock-blocked migration rolls back completely. |
| `tests/db/restore.test.mjs` | **6/6.** Covers: the original defect reproduced with the old procedure; the new restore keeps identical data, constraints and indexes, with no `anon` access; an injected failure after the data load rolls back to an empty target; a skipped permission step is caught by validation; populated, corrupted and manifest-less targets are refused; a wrong confirmation label aborts. |
| `tests/api/api.test.mjs` (2 instances plus 1 deliberately mislabelled) | **19/19.** Covers: passwords, the old PIN refused, lockout across instances, concurrent attempts, session fixation, logout replay, revocation, outage failing closed, authorization on every route, booking validation, 20 concurrent bookings giving 1, retries, family bookings on one phone, the shared per-address limit, and the **mislabelled instance refusing all data access**. |
| `tests/ui/admin.ui.mjs` (Chromium, 390 px and 1440 px) | **13/13.** Covers: password field attributes; the short-input guard; wrong and empty input; **owner and each of the 3 staff accounts logging in with a pasted password**; staff Done/block/unblock; owner "Voir tous" and cancelling another barber's booking; logout replay refused; live revocation; disabled account; privacy page with no CSP errors and no horizontal scroll. |
| Hash memory burst (24 simultaneous logins) | 4 refused by the limiter (429), 18 hashed then refused (401), 2 refused because the hash queue was full (503). Peak memory about **270 MB above baseline**, i.e. bounded. |
| Visual comparison against the previous approved run (animations frozen, 32 screens) | Differences only on: the login screens (wording and field), the confirm step (new privacy line), and the tickets (random references). Every other screen, including all dashboards, is **identical** (similarity score 1.0). |
| Intro and LIVE measurements | First load: 34 of 408 frames, 1,204,836 B on desktop and 1,051,954 B on mobile. A full scroll still loads all 408 frames (5,106,632 B desktop / 3,248,554 B mobile) with **0 blank samples** and the canvas visible after a fast jump. LIVE polling: 10 requests per visible 10 minutes, **0 while hidden**, **0 while off-screen**, 1 on return into view. |
| `npm audit --omit=dev` | Only `postcss` (via `next`) remains (see §A). |
| Secret and diff review | No real credentials, dumps or customer data in the tree. The only synthetic hash is a fake all-`A` placeholder. Test passwords are clearly synthetic and exist only in local test databases. |

**Not run:**

- **Hosted Supabase tests.** The only project is production; no isolated project exists, so no hosted writes were made.
- **Anything on Vercel:** CDN cache, real HTTPS cookies, `x-forwarded-for` handling. Those are post-deployment checks, §D8.
- **`next lint`** (no ESLint config in the repo).

## C. Readiness by layer

| Layer | State |
|---|---|
| **Code and local tests** | **Ready.** |
| **Isolated Supabase verification** | **Not done:** no isolated project exists (only `3ebchi-style`, ref `wxfxuijnwufbwdmkoaff`, Postgres 17, eu-central-1, which is production). Done after §D2 on the new Preview project. |
| **Production database and configuration** | **Not ready.** The migration isn't applied; there's no environment label and no passwords. Vercel variables are shared between Preview and Production (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SESSION_SECRET` target both). `DATA_ENVIRONMENT` and `ADMIN_HOSTS` don't exist. The new code **refuses to run** without them, which is safe but means no service until they're set. |
| **Post-deployment checks** | Pending (§D8). |

## D. Release procedure

Steps run in order. **Windows notes:**
- `npm …` and `node …` commands run in **PowerShell** (Node ≥ 20) from the repo folder.
- `scripts/*.sh` are **bash** scripts and **don't run in PowerShell**. Use **WSL (Ubuntu)**, set up once:
  ```
  wsl --install                    # PowerShell (admin), then reboot and open "Ubuntu"
  sudo apt update && sudo apt install -y postgresql-common
  sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh
  sudo apt install -y postgresql-client-17   # production is Postgres 17: pg_dump must be ≥ 17
  cd /mnt/c/<path-to>/3ebchi-style
  ```
- For connection strings, use Supabase → **Connect** → **Session pooler** (works over IPv4).
- Type the connection string at the hidden prompt. Never put it in a command line.

**Order and why.** The migration is applied **before** the deploy. This was tested: the old app keeps working on the new schema, so there's no maintenance window. The new code is deployed only after the label and passwords exist. The PIN cleanup comes last.

**D0. Freeze.**
- No other deploys during the release.
- Commit and push this release candidate to `preview` only after **D3**. Before D3, a Preview build would run against shared variables and refuse database access.

**D1. Verified backup of production (WSL).**
```
bash scripts/db-backup.sh backup production      # writes backups/production-<UTC>.dump + .manifest, then verifies them
bash scripts/db-backup.sh verify backups/production-<UTC>.dump
```
- Copy both files somewhere private and encrypted. **They contain customer data.**
- This covers the database only. Photos, videos and frames are in git, and Storage isn't used.

**D2. Create the Preview database** (you, in the Supabase dashboard). New project, Free plan. Then in **its** SQL Editor:
1. Run `supabase/migration.sql`.
2. Run `supabase/migrations/20261004120000_security_hardening.sql`.
3. Run `insert into public.app_environment (name) values ('preview');`
4. Set test passwords with `npm run set-password -- <id>`, each **different from production**, and paste the output there.
5. Run `select public.release_preflight('pre-deploy');` and expect `"ok": true`.

**D3. Vercel environment variables** (you, Project → Settings → Environment Variables).

| Variable | Production | Preview |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wxfxuijnwufbwdmkoaff.supabase.co` | the **new** Preview project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | current key, **Production only** | Preview project key |
| `SESSION_SECRET` | current, Production only | **new** random value ≥ 32 characters |
| `DATA_ENVIRONMENT` | `production` | `preview` |
| `ADMIN_HOSTS` | **required**: the production host where `/barber` should open (decision E3) | e.g. `3ebchi-style-git-preview-badis4.vercel.app` |

- Today the first three variables target both environments. Edit them to Production only, then add Preview values.
- Check separation in PowerShell:
  ```
  npm run preflight -- separation https://wxfxuijnwufbwdmkoaff.supabase.co https://<preview-ref>.supabase.co
  ```
  It must print `RÉSULTAT : conforme` and exit with code 0.

**D4. Migrate production** (SQL Editor of `3ebchi-style`).
- Paste and run `supabase/migrations/20261004120000_security_hardening.sql`.
- Read the NOTICEs: a preflight count of non-conforming rows, and any constraint left NOT VALID. Note them; nothing is deleted.
- If the run fails with a lock timeout, nothing was applied. Wait a minute and rerun.
- Then run: `insert into public.app_environment (name) values ('production');`

**D5. Passwords** (PowerShell, then the production SQL Editor).
- Run `npm run set-password -- 3ebchi`, then `achref`, `brag`, `imed`.
- Each barber types their own password, at least 15 characters, typed hidden and twice.
- Paste each printed block into the SQL Editor, then clear the terminal.
- **Never** store that output in a file, a chat or a report.

**D6. Read-only preflight** (production SQL Editor).
```
select public.release_preflight('pre-deploy');
```
Expect `"ok": true`. **Stop** if it's false.

**D7. Deploy (you).**
1. Commit and push to `preview`, then smoke-test the Preview deployment against the Preview database:
   - home and intro, LIVE widget, a booking, the slot-taken message, `/confidentialite`;
   - `/barber` login with a Preview test password, then logout.
2. Merge to `main` (the production deployment).

**D8. Production smoke tests** (immediately after the deploy).
- Home, intro scroll and LIVE widget. Then book a test appointment with an obvious test name, and cancel it from the dashboard.
- On the `ADMIN_HOSTS` host:
  - the owner logs in with a password manager or paste, then checks "Voir tous" and logs out;
  - one staff member logs in;
  - a wrong password shows "Mot de passe ghalet".
- In DevTools, check:
  - headers on `/` and `/api/next-slots`: CSP, HSTS, `X-Frame-Options: DENY`, no `X-Powered-By`;
  - the cookie is `__Host-3ebchi_admin` with HttpOnly, Secure and SameSite=Strict;
  - a second request to `/api/next-slots` within 30 seconds shows `x-vercel-cache: HIT` or `STALE`;
  - no CSP errors in the console.
- Vercel → Logs: no `data environment check failed` messages.

**D9. Post-cutover cleanup** (same day, after D8 passed and the owner has logged in on production).
- Run `supabase/release/post_cutover_cleanup.sql` in the production SQL Editor.
- It refuses automatically if any precondition is missing.
- It clears the PIN hashes, so old deployment URLs can no longer open a session. It also revokes the legacy `create_booking` function.
- The script ends with `release_preflight('post-cutover')`; expect `"ok": true`.

**D10. Backup again** with `bash scripts/db-backup.sh backup production`. Then repeat at least weekly: Supabase Free has no automatic backups.

## E. Owner input and unavailable access

1. **Hosting plan.** Vercel Hobby is non-commercial only; this site advertises paid services. Choose Pro or another eligible host before publishing (§G). I didn't purchase or migrate anything.
2. **Preview Supabase project.** It has to be created by you (§D2). It doesn't exist, and I wasn't authorized to create it.
3. **Admin host (`ADMIN_HOSTS` for Production).** Options:
   - the public domain `3ebchi-style-badis4.vercel.app`: `/barber` becomes reachable there, protected by passwords;
   - a production-only alias such as the `main` branch URL: check after deploy whether Vercel Deployment Protection blocks it for the barbers.
4. **Privacy page facts.**
   - Confirm the contact channel shown: the salon plus 3EBCHI's Instagram `@abdouabidi`. `SITE.phone` in `config/site.ts` is still the placeholder `216XXXXXXXX` and is not shown anywhere.
   - Choose a retention period, if any. Today nothing is deleted automatically and the page says so; automatic deletion was not enabled.
   - Confirm legal identity and INPDP declaration status. The page makes **no** legal compliance claim.
5. **Passwords.** Each barber chooses and types their own during D5.
6. **Optional:** review the historical rows that a new CHECK constraint left NOT VALID (the preflight lists them).

## F. Recovery and stop conditions

**Stop the release** (don't continue to the next step) if:
- D1 backup verification fails;
- the D2 or D6 preflight isn't ok;
- the D3 separation check fails;
- the D4 migration fails twice;
- the D7 Preview smoke test fails;
- any D8 check fails.

**Problems before D9** (new deploy misbehaves):
- Use Vercel **Instant Rollback** to the previous production deployment. The migrated schema is compatible with the old code (tested), and bookings keep working.
- The old deployment was built without `ADMIN_HOSTS`, so its middleware defaults to the Preview branch host, which now serves the new code. Vercel deployments normally keep the environment they were built with, so PIN login should not reappear on the public domain. **Verify this after any rollback:** `/barber` on the public domain must return 404. If it doesn't, remove the `ADMIN_HOSTS` variable from Production and redeploy the old commit.
- Fix forward, then redeploy.

**Problems after D9:**
- The old code can no longer log in (PINs cleared). Its booking function is revoked.
- **Preferred: fix forward.** If you really must serve the old build temporarily, restore bookings only, with `grant execute on function public.create_booking(text,text,numeric,integer,date,time,text,text,text) to service_role;`.
- **Never** restore PIN hashes.

**Data loss or corruption:**
- Create a **new** Supabase project and restore into it from WSL:
  ```
  bash scripts/db-backup.sh restore backups/<file>.dump <label>
  ```
  The restore is atomic: it validates permissions, RLS, row counts and constraints before COMMIT, and on any error the new project stays empty.
- Then check `release_preflight`, point Vercel's Production variables at the new project, and redeploy.
- **Never** restore over the populated database; the tool refuses to.

**Revoke a person immediately:**
```
update public.barbers set active = false where id = '<id>';
select public.admin_sessions_revoke_all('<id>');
```

## G. Hosting eligibility (separate from code correctness)

- **Vercel.** The official Fair Use Guidelines (docs page dated 2026-09-14) say:
  > Hobby teams are restricted to non-commercial personal use only. All commercial usage of the platform requires either a Pro or Enterprise plan.

  Their examples include "Advertising the sale of a product or service". A barbershop site with prices and booking falls under that. The Vercel API didn't expose the team's plan. **If the team is on Hobby, the site isn't eligible for production use there.** This is **unresolved**, and this release isn't labelled production-ready because of it.
- **Supabase.** Supabase's backup documentation says only Pro, Team and Enterprise projects are backed up daily, and Free projects should export regularly. That's covered by `scripts/db-backup.sh`, which must be run regularly (§D10).
