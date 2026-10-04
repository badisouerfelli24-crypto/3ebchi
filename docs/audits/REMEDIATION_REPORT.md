# Remediation report: 3EBCHI STYLE security, booking integrity and resource fixes

- **Date:** 2026-10-04
- **Scope:** local implementation of the findings in `SECURITY_DATABASE_AUDIT.md`, following `NEXT_CONTROLLED_IMPLEMENTATION_PROMPT.md`.
- **State of the work:** every change is in the working tree, **not committed, pushed or deployed**. No hosted database, Supabase project, Vercel setting or real credential was touched or used.
- **Test environment:** a disposable PostgreSQL 16 cluster, a test-only PostgREST stand-in, local `next start` builds, synthetic data and synthetic passwords.

> This report does **not** say that the site is fully secure, that double booking is impossible in every circumstance, or that production is fixed.
> Production stays exactly as it was until the steps in `RELEASE_CHECKLIST.md` are carried out. Two of those steps need a decision from the owner: the login screen change, and separating Preview from production.

---

## 1. Summary by finding

| ID | Finding | Status |
|---|---|---|
| F-01 | 4-digit PIN with an in-memory, per-address lockout | **Fixed and verified locally, UI included** (second pass: the login screen patch is applied and tested in a real browser for every account). The first-pass status was "UI change blocked". |
| F-02 | Server doesn't enforce window, past times, slot grid or real dates | **Fixed and verified locally.** |
| F-03 | Fake-booking flooding | **Fixed and verified locally** (thresholds can be tuned). |
| F-04 | Preview admin probably uses the production database and key | **Confirmed by read-only inspection** (second pass): Preview and Production share one Supabase URL and service key. The safeguard is now **checked against the database's own label** and verified locally. **External release action required:** a separate Preview project and environment variables. |
| F-05 | Sessions can't be revoked | **Fixed and verified locally**, including in a real browser (logout replay, server-side revocation, disabled account). |
| F-06 | No security headers | **Fixed and verified locally.** The CSP keeps `'unsafe-inline'` for scripts; this is a documented tradeoff. |
| F-07 | An absence block and a booking can be created at the same instant | **Fixed and verified locally** (audit case C6). |
| F-08 | Network timeout after success leaves an unknown "ghost" booking | **Fixed and verified locally** (idempotency key). |
| F-09 | Dashboard ignores failed actions | **Fixed and verified locally.** Failures now use the app's existing alert pattern; no new UI. |
| F-10 | Database trusts its single caller completely | **Fixed and verified locally** (CHECK constraints, narrowed functions, grants). |
| F-11 | Extensions possibly installed in `public` | **Fixed locally. Needs verification on the hosted database.** |
| F-12 | No retention policy or customer notice | **Partially addressed** (second pass): a factual privacy page and links. **The owner must decide** the retention period, confirm the contact channel and check Tunisian (INPDP) obligations. |
| F-13 | Minor items | **Fixed** (the PIN wording on the screen was changed with the applied login patch). |
| Deps | `postcss` (via `next`) and `sharp` advisories | **`sharp` fixed** (0.35.5, second pass). **`postcss` remains** (needs Next 16; not reachable, see §9 and PRODUCTION_READINESS). |
| R-1 | LIVE widget polls forever, including in hidden tabs | **Fixed and measured.** |
| R-2 | Intro preloads all 408 frames on every visit | **Fixed and measured.** |

---

## 2. What changed, finding by finding

### F-01 and F-05: admin authentication and sessions

**Credentials.** Each barber now has a long password instead of the shared 4-digit PIN.
- **Hashing:** scrypt via Node `crypto` (N=2^17, r=8, p=1, 16-byte salt, 32-byte key). About 410 ms and 128 MiB per check, measured locally.
- **Storage format:** `scrypt$v=1$…`, in `barbers.password_hash`.
- **Policy** (`lib/password.ts`), following NIST SP 800-63B-4:
  - 15 to 128 characters, with no composition rules;
  - rejects lists of common words and of the shop's own terms (shop name, barber names, "barber", "tunis", …);
  - rejects heavy repetition.
- **Timing:** unknown accounts, accounts without a password and disabled accounts all get the same response. Known-but-unusable accounts are checked against a dummy hash so they take the same time.
- **Provisioning:** `npm run set-password -- <barberId>`.
  - The password is typed hidden, twice, so it never appears in shell history.
  - The command prints SQL to paste into the Supabase SQL editor. That SQL sets the hash, revokes every session for that barber and clears their lock.
  - The command **never connects to a database**.
  - The old `scripts/hash-pin.ts` was removed; it put the PIN in shell history.

**Shared attempt limiter.** This replaces the in-memory, per-instance limiter.
- **Where it lives:** table `rate_limits`, driven by `auth_login_begin()`.
- **Counting:** each attempt is counted, under row locks, **before** the password is checked. Simultaneous attempts therefore can't race past the threshold.
- **Keys:** one per account and one per network address. The address key is an HMAC of the IP made with `SESSION_SECRET`, so raw IPs aren't stored. IPv6 is grouped to /64.
- **Defaults:**
  - per account: 5 failures in 15 min, then a lock that escalates 15 → 30 → 60 min;
  - per address: 20 attempts in 15 min across all accounts.
- **Outage behavior:** if the limiter store is unreachable, login is refused with HTTP 503 ("fail closed"); nothing falls back to unlimited attempts.
- **Proxy headers:** `x-forwarded-for` is only trusted on Vercel, which overwrites it, or when `TRUST_PROXY_HEADERS=1`.

**Server-side sessions.** These replace the signed cookie that couldn't be revoked.
- **Token and storage:** a random 32-byte opaque token in cookie `__Host-3ebchi_admin` (HttpOnly, Secure, SameSite=Strict, Path=/). Only its SHA-256 hash is stored, in `admin_sessions`.
- **Validation:** checked against the database on every admin request (one RPC).
  - Absolute lifetime is 8 h; idle timeout is 3 h.
  - The session ends if the password changed after it was created, if the barber is set `active=false`, or on logout.
- **Owner rights:** checked on every request. They need **both** `barbers.is_owner` in the database **and** the owner flag in `config/site.ts`, so removing either one removes them.
- **Session fixation:** login always issues a fresh token and revokes the previous one.
- **CSRF:** login requires a same-origin `Origin` header, and every state-changing admin route checks same-origin. Combined with SameSite=Strict cookies and JSON-only request bodies.

**Not done here: the login screen.** It still collects a 4-digit numeric PIN, so it can't submit a password.
- Per the authentication conflict rule, I did **not** redesign it.
- I also did **not** keep a PIN fallback. The old PIN is rejected, which is tested.
- See §3 for the prepared patch.

### F-02: server-side booking rules

`lib/bookingRules.ts` (`validateBooking`) is used by `/api/book`, and the same date rule is used by `/api/availability`. It applies exactly what the booking form offers:
- a real calendar date, within the booking window (`bookableDays()`), and not a closed day;
- a start time on the slot grid (`generateSlots()`) that isn't in the past for today (Tunis time);
- the service fitting before closing time;
- a known barber and service.

Errors reuse the form's existing French messages.

**Price and duration** always come from `config/site.ts`. Values sent by the client are ignored, which is tested by tampering with price, duration, status and barber.

**Strict request handling:**
- JSON content type only;
- bodies over 4 KB (booking) or 2 KB (login) are rejected before parsing;
- name, phone and note are length-checked;
- phone numbers are normalized to `216XXXXXXXX`.

### F-03: abuse limits on public booking

- **Per address:** 6 bookings per 10 min. This counter lives in the database, so it holds across server instances.
- **Per phone:** *[Changed in the second pass]* the cap is now **optional and off by default** (`BOOKING_MAX_ACTIVE_PER_PHONE=0`), in both the API and the database function. One phone can book for a whole family again. See §9.
- The existing honeypot field is kept and still stores nothing.
- The existing in-memory limiter (20 per 10 min) stays as a cheap first filter.
- The client gets the existing "Trop de tentatives" message with HTTP 429.
- Thresholds can be changed through environment variables (`lib/securityConfig.ts`, `.env.example`).

### F-04: Preview and production data separation (code part)

`lib/supabase.ts` now refuses every database call on Vercel unless `DATA_ENVIRONMENT` equals `VERCEL_ENV`.
- Example: a Preview deployment fails safely if it's configured with the production database marked `DATA_ENVIRONMENT=production`.
- An explicit escape hatch exists: `ALLOW_PREVIEW_ON_PRODUCTION_DATA=I_UNDERSTAND`.
- In production, `SESSION_SECRET` must also be at least 32 characters.

**This doesn't separate the data by itself.** The owner still has to create a separate Supabase project for Preview and set the environment variables in Vercel; see the checklist. The admin host gating (`middleware.ts`, `ADMIN_HOSTS`) is kept, and it's documented as defense in depth, not as access control.

### F-06: security headers (`next.config.ts`)

**Applied to every page and API:**
- Content-Security-Policy:
  - same-origin only for scripts, styles, images, fonts, media and connections;
  - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`;
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- a restrictive `Permissions-Policy`;
- `Cross-Origin-Opener-Policy: same-origin`;
- HSTS (two years, includeSubDomains);
- the `X-Powered-By` header is removed.

**The `'unsafe-inline'` tradeoff.** The CSP allows `'unsafe-inline'` for scripts. A nonce-based CSP would force every page to be rendered dynamically on each visit, losing static caching and adding Vercel invocations. The policy still blocks scripts and connections from any other origin, plus framing.

**Other header details:**
- Vercel toolbar origins are allowed **only** on Preview deployments.
- `/barber` sends `X-Robots-Tag: noindex`.

**Verified:** no CSP violations in the console in any of the browser scenarios (desktop and mobile).

### F-07: blocks versus bookings race

Booking creation (`create_booking_v2`), block creation (`create_block`) and block deletion now take the same per-barber advisory lock, and the booking re-checks blocks while holding it.
- Audit case C6 (a booking and an overlapping absence created simultaneously) is now covered by a test, and they can no longer both succeed.
- Fixed in passing: the owner could not delete another barber's block (it failed silently). The owner now can; staff can delete only their own.

### F-08: retry safety (idempotency)

- **Client:** `Booking.tsx` sends a `requestKey` (UUID). The same form contents keep the same key across retries; changed contents get a new key.
- **Database:** `bookings.request_key` has a unique index.
  - A retry with the same key and the same data returns the **same** booking (same reference).
  - A retry with the same key but different data is refused without revealing the first booking.
- **Timeout:** the client now gives up after 20 s instead of hanging. The server's database calls also time out after 10 s.

### F-09: dashboard error handling

`app/barber/page.tsx` has a small `adminSend` helper used for done/cancel, block create and block delete.
- An expired session (401) reloads the page, which shows the login screen.
- Any other failure shows `alert("Mochkla. 3awed essaye.")`, the same plain alert style the dashboard already used.
- The block form keeps its values when saving fails.
- No new visible components were added.

### F-10: database defenses

Migration `supabase/migrations/20261004120000_security_hardening.sql` is additive, idempotent and re-runnable. It adds:

**CHECK constraints:**
- price ≥ 0;
- duration 5–480 min;
- name 2–60 characters;
- phone matches `^216[0-9]{8}$`;
- note ≤ 300 characters;
- whole-minute start times;
- dates ≥ 2025-01-01;
- block reason ≤ 120 characters.

They're added `NOT VALID` and then validated. If old rows don't conform, the rows are **kept**, the constraint protects new writes only, and a NOTICE says so. This happened in the upgrade test with a legacy one-letter name.

**Narrow functions and grants.** Status changes go through `set_booking_status`, which only allows confirmed → done or cancelled, and only by the booking's own barber or the owner. Other functions: `create_block`, `delete_block`, plus the auth and session functions. Every new function:
- runs with the caller's rights (`SECURITY INVOKER`, the default) and a fixed `search_path`. *[Corrected in the second pass: the first version of this report wrongly said `SECURITY DEFINER`. Invoker rights are the safer choice here, because only `service_role` can call these functions.]*
- has EXECUTE revoked from `public`, `anon` and `authenticated`, and granted to `service_role` only.

**Access:** RLS is enabled with no policies on the new tables. Tested: `anon` and `authenticated` cannot read, write or call anything.

**Housekeeping:** `security_housekeeping()` removes only stale limiter rows and expired sessions, never bookings, in bounded batches.

### F-11: extensions

The migration moves `btree_gist` and `pgcrypto` into the `extensions` schema when they're in `public`.
- Tested: upgrade, a fresh install, and re-running the original `migration.sql` afterwards.
- On Supabase this has to be confirmed with the catalog query in the checklist.

### F-13: minor items

| Item | Resolution |
|---|---|
| Logout cookie attributes | Cleared with the same attributes it was set with. |
| Two sources of truth for the owner role | Both now have to agree, as described under F-01/F-05. |
| Non-UUID IDs, bad dates or far dates gave 500 | Now return 400 or 404. |
| PIN in shell history | `hash-pin` removed; `set-password` reads the password hidden. |
| README out of date | Updated: password section, migrations, environment variables, security summary, BAFFI naming, and the stale footer link. |

The login screen's "PIN" text is changed by the UI patch, not here, because it is visible copy.

### R-1: LIVE widget polling (`LiveSlots.tsx`, `/api/next-slots`)

- Polls every 60 s **only** while the tab is visible, online and the widget is on screen.
- Only one request can be in flight at a time; stale responses are ignored; requests are cancelled after 15 s.
- After failures it backs off exponentially, up to 10 min.
- Refreshes immediately when the widget comes back into view if its data is more than 60 s old.
- `/api/next-slots` sends `Cache-Control: public, max-age=0, s-maxage=30, stale-while-revalidate=30`. It only returns public slot times, and booking stays authoritative in the database.

### R-2: intro frame loading (`CinematicIntro.tsx`)

Loading is now progressive:
- the first 18 frames and every 24th frame load first, so a nearby frame is always available;
- after that, frames load ahead of and behind the scroll position, in the scroll direction, with at most 6 in parallel;
- once the visitor scrolls, the rest fill in;
- failed frames are retried once;
- off-window requests are cancelled; everything is cleaned up on unmount.

**Unchanged:** drawing, frame count, nearest-frame fallback, crop, timing and the animation.

Static media (`/assets/sequence`, `/reels`, `/barbers`) is now cached for one day, then revalidated.

---

## 3. The login screen (F-01 and F-05): resolved in the second pass

> **Second pass:** the patch below is **applied** and refined: a real `<form>`, a hidden username field for password managers, no length truncation, and the 15-character rule counted in Unicode characters like the server. Every account was verified in Chromium. The text below is the first-pass record.

**The blocker.** The backend accepts only passwords; the screen still shows the 4-digit keypad. **Admin login through the UI is impossible until this patch is applied.** This is intentional: the instructions forbid silently introducing a new login design and forbid keeping an insecure PIN fallback.

**The prepared patch:** `docs/audits/login-password-ui.patch`. It is not applied; `git apply --check` passes. It is the smallest change that works:
- the same input box, with the numeric-only filter and 4-digit limit removed;
- `autoComplete="current-password"`, 128-character maximum;
- placeholder "Mot de passe", and the button enabled at 15 or more characters;
- one line of instruction text changed;
- the error message changes from "PIN ghalet 😤" to "Mot de passe ghalet 😤";
- the request sends `password` instead of `pin`.

**Verified locally in a throwaway copy:**
- the patch applies and the build succeeds;
- with Playwright at 390 px wide: a short password keeps the button disabled; a wrong password shows "Mot de passe ghalet 😤" and sets no cookie; the correct synthetic password opens the owner dashboard with the `__Host-3ebchi_admin` cookie.

**Needs:** owner approval of the wording and look, then apply it.

---

## 4. Tests and checks

All runs are local, against synthetic data. Nothing was run against Supabase or Vercel.

| Check | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | **Pass** |
| `next build`, changed code and original code | **Pass** (both) |
| `next lint` | **Not run.** The repo has no ESLint config, and the command would start an interactive setup. |
| `tests/db/db.test.mjs` (fresh install) | **13/13 pass** (re-run at the end) |
| `tests/api/api.test.mjs` (two app instances on one test database) | **18/18 pass** (re-run at the end; passed twice earlier) |
| Migration upgrade on a seeded copy of the original schema | **Pass.** All 8 synthetic bookings kept; the legacy non-conforming row kept; `bookings_name_len` left NOT VALID with a NOTICE. |
| Migration re-run, fresh install, original `migration.sql` re-run after the upgrade | **Pass** |
| Backup → restore round-trip (`scripts/db-backup.sh`, local only) | **Pass.** Row counts and functions identical; refuses a non-empty target. After a restore the migration **must** be re-run, otherwise restored functions are callable by `anon`; the script says so. *[Superseded in the second pass: the restore now fixes and checks permissions inside a single transaction before committing; see §9.]* |
| Login UI patch end-to-end (scratch copy) | **Pass** (§3) |
| Visual comparison, 1440 px and 390 px, 32 screens | **Pass with explanations** (§5) |
| `npm audit` fixes | **Not applied.** No `--force` or overrides were used. |

**What the DB and API tests cover:**
- **Permissions:** `anon` and `authenticated` locked out of every table and function; unauthenticated, wrong-staff and owner access tested on every privileged route; admin host gating.
- **Login and lockout:**
  - correct password logs in with a hardened cookie; the old PIN fails; failures are generic;
  - malformed, oversized and cross-site requests are refused;
  - the lockout is shared across two app instances and changing addresses, and expires and escalates;
  - parallel attempts can't pass the threshold;
  - the per-address limit stops one address spraying across accounts.
- **Sessions:**
  - fixation is prevented;
  - logout revokes server-side, so replaying the old cookie fails;
  - a password change, a disabled account, expiry, idle timeout and owner-role removal take effect on the next request;
  - a limiter or database outage fails closed.
- **Booking concurrency (DB):**
  - 20 simultaneous conflicting bookings with mixed durations: exactly 1 succeeds;
  - overlapping intervals of unequal length never coexist; adjacent ones do;
  - different barbers don't wait on each other, while the same barber is serialized;
  - the C6 block-versus-booking race is fixed.
- **Booking concurrency (API):** 20 simultaneous bookings for the same slot through two app instances produce exactly 1 appointment.
- **Booking idempotency and abuse limits:**
  - replay returns the same booking; parallel retries create one row; a mismatched replay is refused;
  - the per-phone cap and the per-address limit hold across both instances;
  - the honeypot stores nothing.
- **Booking validation:**
  - invalid dates, window, past time, grid, closed day, overrun, unknown barber or service, and sizes are all rejected with 400;
  - tampered price, duration, status and barber are ignored.
- **Status changes and blocks:** status transitions; block ownership.
- **Database:** CHECK constraints apply even to the privileged role; housekeeping is bounded and never touches bookings.
- **Headers and caching:** public endpoints expose slot times only and set the intended cache headers; security headers are present and there's no framework fingerprint.

**Test-environment limitations:**
- The PostgREST stand-in (`tests/support/pgrest-shim.mjs`) runs SQL as a stub `service_role`. It reproduces the RPC and table calls the app makes, not all of PostgREST.
- The `anon`, `authenticated` and `service_role` roles are local stubs, not Supabase's real roles. Grants, RLS and the catalog therefore need the live checks in the checklist.
- Vercel's CDN, its rewriting of `x-forwarded-for`, and the production cookie behavior over real HTTPS were not tested. Chromium accepts `Secure` cookies on `localhost`.

---

## 5. UI and features: checked and preserved

**Method.** The original build and the changed build ran side by side against the same test database. Playwright took 16 screens at 1440×900 and 16 at 390×844, through the same flows:
- intro at 0/30/70%;
- hero, barbers, prices;
- booking slot picker, form, confirmation, ticket, and the slot-taken conflict;
- admin login choice, login entry, owner dashboard, owner "Voir tous", staff dashboard.

Screens were compared with SSIM, a similarity score where 1.0 means identical.

**Results:**
- **First pass (CSS animations running):** all 10 admin screens identical (1.0000). Public screens 0.956–0.992, and one at 0.614. The diff images showed grain/drift animation noise and, for the 0.614 screen, a scroll offset of about 20 px.
- **Second pass (both builds with CSS animations frozen via the test-only `FREEZE=1` option):** 29 of 32 screens **identical (1.0000)**, including the intro at 30% and 70%. Three differed:
  - `desk-09-ticket` and `mob-09-ticket`: only the random booking reference differs. On mobile, the longer reference wraps to two lines and pushes the card down.
  - `mob-08-confirm`: a different scroll position with the same content.
- **Third check (original build captured twice):** the **original build differs from itself** on the same screens (`mob-08`, `mob-09`, `desk-10`, `mob-10`, `desk-09`). Against that second original run, the changed build's `mob-08` is identical.

**Conclusion:** the remaining differences come from random references and scroll timing, not from the code changes.

**Functionality confirmed working in the changed build:**
- the intro still plays the full 408 frames, with 0 blank samples during a forward scroll and a visible canvas right after a fast jump;
- the LIVE widget, including the retry button;
- the booking flow (success ticket and slot-taken message);
- the owner and staff dashboards, including "Voir tous", stats, Done/Annuler and blocks;
- admin host gating.

Console errors are the same as the original: the expected 409 in the conflict scenario and 401 on the admin page's initial session check.

**Not changed:** design, copy, sections, features, intro animation, and prices/config. The only visible-behavior differences:
- the dashboard shows an alert on a failed action, where it used to fail silently;
- the login screen can't log in until the patch in §3 is applied.

---

## 6. Measurements (local, `next start`, synthetic data)

**Intro frames (R-2):**

| | Before | After |
|---|---|---|
| Desktop first load, no scroll | 434 requests, 5,907,420 B; 408 frames (5,106,632 B) | 60 requests, 1,204,714 B; 34 frames (403,056 B) |
| Mobile first load, no scroll | 4,049,342 B; 408 frames (3,248,554 B) | 1,051,832 B; 34 frames (250,174 B) |
| Full scroll through the intro | all 408 frames | all 408 frames; same bytes; 0 blank samples; canvas visible after a fast jump |

That is about **80% less** transfer on desktop and **74% less** on mobile for a visitor who doesn't scroll.

**LIVE widget polling (R-1),** counted in the page with a simulated clock:

| Scenario | Before | After |
|---|---|---|
| On load | 1 | 1 |
| Visible for 10 min | 7 | 10 (one per minute, as designed) |
| Tab hidden for 30 min | **20** | **0** |
| Visible again for 2 min | 2 | 2 |
| Widget scrolled off-screen for 10 min | 7 | **0** |
| Widget scrolled back into view | 0 | 1 (data was stale) |

The original's "visible" count was lower only because its timer drifted under the simulated clock. On Vercel, the 30 s shared CDN cache also means many visitors share one function call per 30 s. That CDN behavior has to be checked on a deployment.

**Dependencies:**
- `postcss` reaches the app only through `next`; the fix needs a major upgrade to Next 16.
- *[Corrected in the second pass: this claim was wrong.]* `next@15.5.27` accepts `sharp ^0.34.3 || ^0.35.4`, so the patched `sharp 0.35.5` was compatible. It is now installed with a plain `npm audit fix` (no `--force`, no overrides); see §9.
- Neither is reachable in this app, as the audit concluded. They're deferred until a Next 15.x patch or a planned Next 16 upgrade.
- `bcryptjs` is no longer used by the code. It was left in `package.json` to avoid lockfile churn and can be removed later.

---

## 7. Blocked or deferred items and why

1. **Login UI change (F-01/F-05):** waiting on owner approval of the patch (§3).
2. **Preview/production separation (F-04):** needs a new Supabase project and Vercel environment variable changes. Not authorized here.
3. **Applying the migration and passwords to the hosted database:** not authorized here. The steps are in the checklist.
4. **Retention policy and privacy notice (F-12):** needs the owner's policy decision and new customer-facing copy.
   - Technical option, not implemented: a scheduled anonymization of names and phone numbers N months after the appointment.
5. **Live checks:** catalog and grants, extension schema, headers on the real domain, CDN cache, proxy IP header. These are checklist items.
6. **Dependency advisories:** see §6.
7. **Hosting-plan items, for information only, no action taken:**
   - Vercel Hobby is for non-commercial use, and a business site may need Pro;
   - Supabase Free pauses inactive projects and has no automatic backups (hence `scripts/db-backup.sh`).

---

## 8. Files

**Changed (20):**
- configuration and docs: `.env.example`, `.gitignore`, `README.md`, `next.config.ts`, `package.json`;
- server libraries: `lib/auth.ts`, `lib/rateLimit.ts`, `lib/supabase.ts`;
- API routes:
  - public: `app/api/book/route.ts`, `app/api/availability/route.ts`, `app/api/next-slots/route.ts`;
  - admin: `app/api/barber/{login,logout,bookings,action,block}/route.ts`;
- client: `app/barber/page.tsx`, `app/components/{Booking,LiveSlots,CinematicIntro}.tsx`.

**Removed:** `scripts/hash-pin.ts`.

**New:**
- `supabase/migrations/20261004120000_security_hardening.sql`;
- `lib/{securityConfig,password,requestGuards,bookingRules}.ts`;
- `scripts/set-password.ts`, `scripts/db-backup.sh`;
- `tests/support/{test-db.sh,pgrest-shim.mjs,seed-synthetic.sql}`;
- `tests/db/db.test.mjs`, `tests/api/api.test.mjs`, `tests/visual/{capture,compare}.mjs`;
- `docs/audits/{REMEDIATION_REPORT.md,RELEASE_CHECKLIST.md,login-password-ui.patch}`.

**Untouched:** `supabase/migration.sql` (the original baseline), environment secret files, hosted services.

The test scripts talk only to `localhost` and the disposable local cluster, and they contain only synthetic credentials.

---

## 9. Second pass: release-candidate work (2026-10-04)

`PRODUCTION_READINESS.md` is the single handoff. This section records what changed in this pass.

| Area | Change | Evidence |
|---|---|---|
| Login screen (F-01/F-05) | Patch applied and refined. Masked password field inside a `<form>`, with `autocomplete="current-password"` and a hidden `username` field. No numeric keypad, no 4-character limit, no truncation. The button enables at 15 Unicode characters, matching the server policy; the server remains the authority. | `tests/ui/admin.ui.mjs`: 13/13 in Chromium at 390 px and 1440 px. |
| Hashing memory | At most 2 scrypt computations per instance (about 256 MiB), with a bounded queue of 16; beyond that the server answers 503 without hashing. A stored hash that would need more than 256 MiB is rejected. | Burst of 24 simultaneous logins: 4 refused by the limiter (429), 18 hashed and refused (401), 2 refused because the queue was full (503). Peak memory was about 270 MB above baseline. |
| Account enumeration timing | Unknown IDs skip hashing. Barber IDs are already public on the login screen, so the timing difference reveals nothing new, and adding dummy hashes would only add denial-of-service cost. Known accounts without a password, or disabled ones, still hash a dummy value, and are bounded by the per-account limiter. | Documented tradeoff. |
| Restore (release-critical) | `scripts/db-backup.sh restore` now runs in **one psql transaction**: data, then the canonical permissions (`supabase/permissions.sql`), then validation (`supabase/restore-validate.sql`), then COMMIT. Any error causes a ROLLBACK and leaves the target empty. It refuses populated targets (`FORCE_RESTORE` was removed), verifies the backup's SHA-256 and row counts from a manifest, and never re-enables the legacy `create_booking`. | `tests/db/restore.test.mjs`: 6/6. Includes reproducing the original defect, an injected failure mid-restore, and a skipped permission step caught by validation. |
| Migration | Wrapped in `BEGIN … COMMIT` with `lock_timeout 5s` (all-or-nothing). Adds the environment label table, a schema version record, the read-only `release_preflight()` function, opportunistic cleanup on bookings, and a PostgREST schema reload. | `tests/db/migration.test.mjs`: 7/7. |
| Cutover | The old app keeps working on the migrated schema, so the migration can run before the deploy. `supabase/release/post_cutover_cleanup.sql` clears the PIN hashes and revokes the legacy RPC, but only once the owner has a password session. | `migration.test` tests 2 and 5. |
| Environment separation (F-04) | `DATA_ENVIRONMENT` is now required everywhere and must match the label stored in the database (`public.app_environment`). Different labels on the same database are therefore impossible, and a mismatch refuses every query. | API test 17: a mislabelled instance gets 5xx and writes nothing. |
| Booking limits | Per-phone cap optional and off by default (API and RPC). The per-address limit is 6 per 10 minutes, shared across instances; idempotent replays and invalid requests are not counted. | `db.test` 8–9, API test 16. |
| Privacy (F-12, partial) | New `/confidentialite` page, plus a footer link and one line under the booking confirm button. Only verified facts; no invented retention period, legal entity or compliance claim. | UI test 13, screenshots. |
| Dependencies | `sharp` 0.34.5 → 0.35.5, which fixes the sharp advisory. `postcss` (pinned to 8.4.31 inside every `next@15.x`) stays, because only Next 16 ships postcss 8.5.23. `braces` (via `chokidar`, Tailwind 3, dev/build-time only) stays. | `npm audit --omit=dev`: only postcss/next remain. |
| Admin host | The preflight fails in production unless `ADMIN_HOSTS` is set explicitly. The Preview branch URL now uses the Preview database. | `scripts/release-preflight.mjs env`. |

