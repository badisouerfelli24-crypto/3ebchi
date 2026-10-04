# 3EBCHI STYLE: Security, Database and Resource Audit

- **Date:** 2026-10-04
- **Scope:** repository `badisouerfelli24-crypto/3ebchi`, branch `preview` at commit `54b1e19` (`main` is identical).
- **Type:** audit only. No application code, schema, configuration, dependencies or cloud settings were changed.
- **Access used:** the repository plus a throwaway local PostgreSQL 16 database containing made-up data. I had no access to the live Supabase project, Vercel settings, production logs, query plans or usage metrics. Nothing was sent to the deployed site's booking, login or admin endpoints.

**Evidence labels used throughout:**

| Label | Meaning |
|---|---|
| **CONFIRMED IN CODE** | A specific code path or configuration shows it. |
| **REPRODUCED LOCALLY** | Demonstrated with a safe local test; the setup and result are given. |
| **SUSPECTED** | The evidence points to it, but a named condition is still unknown. |
| **LIVE VERIFICATION REQUIRED** | Needs the deployed settings or runtime measurements. |

---

## 1. Readiness verdict

**Ready for a small real-client launch after specified fixes.**

The core of the system is sound:
- **Customer data is not in the browser.** The browser never talks to Supabase. Every database access goes through server routes that use a server-only key.
- **Locked tables.** Row-level security is on for every table with no public policies (verified locally).
- **No double bookings.** The database itself rejects overlapping confirmed bookings for the same barber (proved locally under concurrent load).
- **Staff isolation.** Staff can only see and change their own bookings.

**Decisive problems to fix before real customer data goes in:**

1. **Weak admin login (F-01).** Each hajem logs in with a **4-digit PIN** (10,000 possibilities). The only brute-force protection is a counter kept in a single server instance's memory, keyed by network address. Today the admin pages are also hidden behind Vercel's preview protection, which helps. But if that protection is removed so the other hajema can log in, the PIN becomes the only lock on every customer's name and phone number.
2. **No server-side limit on booking dates (F-02 and F-03).** The server does not enforce the 14-day booking window. It also accepts times that have already passed today, off-grid times and impossible dates. Combined with a per-instance, per-address rate limit, a single person could fill the barbers' calendars far into the future with fake bookings.
3. **Admin runs on preview code with production data (F-04).** The admin area only works on the preview address, so it always runs whatever code is on the `preview` branch. Everything points to that preview environment holding the production database key (the key was added to the Preview environment earlier in this project). That means experimental code would run with full access to real customer data.
4. **Operational gaps.** The Supabase Free plan has no automatic backups (section 8). Vercel Hobby is restricted to non-commercial use, which conflicts with a business site. This is recorded as a separate launch concern and does not change the technical findings.

**Limits of this verdict:**
- **Deployment unknown.** The repository's security file (`supabase/migration.sql`) is not proof of what is actually deployed. Section 10 lists read-only checks to confirm it.
- **Measured locally only.** Concurrency and validation behavior was proven on a local database and by running the real route code locally, not against production.
- **No numbers invented.** No load numbers, query plans or usage figures were made up.

---

## 2. Implemented architecture and sensitive-data flow

| Item | Finding | Evidence |
|---|---|---|
| Framework | Next.js **15.5.27** App Router, React 18.3.1, TypeScript, Tailwind 3 | `node_modules/*/package.json` (installed versions) |
| Rendering | `/` and `/barber` are static pages (client components); every data request goes through route handlers marked `dynamic = "force-dynamic"` | build output; `app/api/*/route.ts` line 9 or 7 |
| Hosting | Vercel through the git integration (`main` is production, `preview` is preview); no `vercel.json`; `next.config.ts` only sets `reactStrictMode` | `next.config.ts:3-5` |
| Database | Supabase Postgres, reached **only** through supabase-js over HTTPS (PostgREST and RPC); no direct Postgres connection string in the code | `lib/supabase.ts:22-24` |
| Supabase client | One server-only singleton using `SUPABASE_SERVICE_ROLE_KEY` (bypasses row-level security); `import "server-only"` blocks it from being bundled for the browser | `lib/supabase.ts:5,10-25` |
| Browser access to Supabase | **None.** No anon key and no Supabase import in client code; the built browser bundle (`.next/static`) contains no `supabase.co` or `createClient` | grep of `.next/static`: 0 hits (CONFIRMED IN CODE) |
| Authentication | Custom: barber ID plus a 4-digit PIN checked with bcrypt; the session is an HMAC-SHA256-signed, httpOnly cookie valid 8 hours. No Supabase Auth, no sign-up, no password reset | `lib/auth.ts`, `app/api/barber/login/route.ts` |
| Roles | Owner versus staff comes from `config/site.ts` (`isOwner: true` on `3ebchi`, line 100). The database column `barbers.is_owner` exists but the **code never reads it** | `config/site.ts:100`; `lib/auth.ts` |
| Realtime, storage, jobs | None. No Supabase Realtime, no Storage buckets, no cron or background jobs | grep: no `.channel(`, `storage.from`, cron |
| Polling | The public "LIVE" widget polls `/api/next-slots` **every 60 s, forever**, including when the tab is hidden | `app/components/LiveSlots.tsx:41-44` |
| Third parties | Outbound links only: TikTok, Instagram, Facebook, Google Maps, `wa.me` (staff dashboard). **No analytics, payment, messaging or error-reporting integration.** Fonts come from `next/font` (self-hosted at build time). No iframes | grep of URLs in `app/`, `config/`, `lib/` |

### Data collected (inventory)

| Field | Where | Source | Notes |
|---|---|---|---|
| `client_name` | `bookings` | booking form | 2–60 characters (`lib/validation.ts:18-21`) |
| `phone` | `bookings` | booking form | normalized to `216XXXXXXXX` (`lib/validation.ts:5-16`); format only, never verified |
| `note` | `bookings` | booking form | free text, max 300 characters, optional |
| `service`, `price`, `duration_min` | `bookings` | **server config** (not the browser) | `app/api/book/route.ts:65-75` |
| `date`, `start_time`, `slot`, `ref`, `status`, `created_at` | `bookings` | server or database | `slot` is computed by a trigger in Africa/Tunis |
| `pin_hash` | `barbers` | owner via the SQL editor | bcrypt cost 10 (`scripts/hash-pin.ts:37`) |
| `reason` | `blocked_slots` | staff | max 120 characters |

**Data the system does not handle:** no email, no account, no payment data. The downloadable ticket (PNG and .ics) is generated in the browser and never uploaded (`app/components/Ticket.tsx`, `lib/ics.ts`). There is no `localStorage` or `sessionStorage` use.

**Retention:** nothing ever deletes or anonymizes bookings. Names and phone numbers stay forever. This is a **business decision still to make** (section 11). The code doesn't establish legal compliance either way; Tunisian data-protection obligations need their own check.

### End-to-end paths

| Path | Authentication | Authorization | Validation | Database integrity | Error handling |
|---|---|---|---|---|---|
| **Initial page load** (`/`) | none needed | n/a | n/a | n/a | Static HTML; then `LiveSlots` calls `/api/next-slots` (public, no personal data) |
| **Availability** `GET /api/availability` | none (public) | n/a | barber and service must exist in config; date must match the regex; **no date range limit** | 2 SELECTs filtered on `barber`+`date` | 500 with a generic message |
| **Booking** `POST /api/book` | none (public) | n/a | honeypot; per-address memory rate limit 5 per 10 min; config barber and service; name and phone format; not a past **day**; open day; inside opening hours (`route.ts:19-61`). **Missing:** booking window, past time today, slot grid, real calendar date | RPC `create_booking` → blocked-slot check → INSERT protected by the exclusion constraint (`migration.sql:87-94,117-190`) | `SLOT_TAKEN` → 409; anything else → 500 generic; the UI never shows "confirmed" unless `ok:true` (`Booking.tsx:132-151`) |
| **Owner login** `POST /api/barber/login` | PIN through bcrypt | barber must exist in config | PIN must be `^\d{4}$` (`lib/auth.ts:50`) | SELECT `pin_hash` | lockout of 5 failures per (address, barber) for 10 min, **in memory** |
| **Owner calendar** `GET /api/barber/bookings?all=1` | signed cookie verified server-side (`route.ts:10-18`) | `all=1` honored only if `isOwner` (config) (`route.ts:21`) | n/a | future non-cancelled bookings for **all** barbers, with name, phone and note; week stats | 401 when there's no session |
| **Staff calendar** `GET /api/barber/bookings` | signed cookie | forced `.eq("barber", sessionBarber)` (`route.ts:36,48`) | n/a | own future bookings and blocks only | same |
| **Mark done or cancel** `POST /api/barber/action` | signed cookie | loads the booking, then **403** unless the booking's barber is the session barber or the session is the owner (`route.ts:35-48`) | action must be `done` or `cancel`; the ID is not checked as a UUID (bad ID → 500) | UPDATE `status` by ID | no client-side handling of failure (`barber/page.tsx:202-207`) |
| **Block or unblock time** `POST/DELETE /api/barber/block` | signed cookie | INSERT always uses the session barber; DELETE filters `id` **and** `barber = session` (`route.ts:47-53,79-83`) | date regex; time regex; end after start; **no check on the date's validity or range** | INSERT or DELETE | no client-side handling of failure |
| **Logout** | none | n/a | n/a | n/a | clears the cookie only; the token stays valid until it expires (`logout/route.ts:8`) |
| **Reschedule or client self-cancel** | **not implemented** (N/A) | | | | |

**Extra gate for every admin path:** `middleware.ts:11-19` returns 404 for `/barber` and `/api/barber/*` unless the Host is `localhost` or is listed in `ADMIN_HOSTS`. The default is `3ebchi-style-git-preview-badis4.vercel.app`. This is **hiding, not authorization**. The real check is the signed cookie in each route, which I confirmed separately.

---

## 3. Coverage matrix and effective permissions

### Coverage

| Area | Status |
|---|---|
| Repository instructions (CLAUDE.md, AGENTS.md) | none exist |
| git status, uncommitted work | clean; nothing modified |
| Every API route (8 handlers in 7 files) | read in full |
| `middleware.ts`, `next.config.ts` | read in full |
| `lib/*` (auth, supabase, rateLimit, validation, slots, time, ics) | read in full |
| `supabase/migration.sql` | read in full, applied twice locally (it can be re-run safely), tested |
| Client data callers (Booking, LiveSlots, barber dashboard) | read |
| Media and bundle size | measured |
| Secret scan (working tree, all git history, built bundles) | done, results redacted |
| Dependency advisories | `npm audit` run; reachability assessed |
| Typecheck | passed |
| Lint | **skipped**: `next lint` has no ESLint config and would start an interactive setup |
| Supabase Realtime, Storage, uploads, webhooks, SSRF, payments | **N/A**: none exist |
| Password reset and sign-up | **N/A**: none exist (PINs are set by the owner in the SQL editor) |
| Deployed RLS, grants, env scopes, headers, usage | **LIVE VERIFICATION REQUIRED** (section 10) |

### Effective permission matrix

| Actor → capability | Expected | Implemented (repo) | Evidence | Confidence |
|---|---|---|---|---|
| **Anonymous**: read availability (times only) | allow | allow; returns only `{time, available, reason}`, no IDs or names | `availability/route.ts:37,63-70`; `next-slots/route.ts:21,62` | High (CONFIRMED IN CODE) |
| Anonymous: create a booking | allow, validated | allow; validation gaps F-02 | `book/route.ts` | High (REPRODUCED LOCALLY) |
| Anonymous: read bookings or client data through the app's API | deny | deny (401 with no cookie or a forged one) | local `curl` test | High (REPRODUCED LOCALLY) |
| Anonymous: direct Supabase Data API (`/rest/v1/bookings`) with the public anon key | deny | RLS on, no policies → 0 rows on SELECT, error on INSERT, 0 rows affected on UPDATE | local test as role `anon` (section 9) | High locally; **LIVE VERIFICATION REQUIRED** for the deployed DB |
| Anonymous: call `create_booking` directly | deny | `REVOKE ... FROM public, anon, authenticated` → "permission denied" | `migration.sql:201-202`; local test | High locally; live check needed |
| Anonymous: read `barbers.pin_hash` | deny | 0 rows as `anon` | local test | High locally; live check needed |
| **Owner**: see all upcoming bookings with name, phone, note | allow | allow | `bookings/route.ts:21,30` | High |
| Owner: cancel or complete any booking | allow | allow | `action/route.ts:46` | High |
| Owner: block time for **another** barber | business rule unknown | not possible (blocks always use the session barber) | `block/route.ts:48` | High; feature gap, not a vulnerability |
| **Staff (own)**: see own upcoming bookings with name and phone | allow | allow | `bookings/route.ts:36` | High |
| Staff (own): cancel or complete own booking | allow | allow | `action/route.ts:46` | High |
| **Staff → another staff member's data**: list | deny | deny (`all=1` ignored for non-owners) | `bookings/route.ts:21` | High |
| Staff → another's booking: cancel or complete by guessed ID | deny | deny (403) | `action/route.ts:46-48` | High |
| Staff → another's block: delete | deny | deny (DELETE filtered by session barber; returns `ok:true` with 0 rows, which is harmless) | `block/route.ts:79-83` | High |
| Staff: become owner | deny | not possible: the role comes from server config, never from the request or token | `config/site.ts:100`; the token holds only `barberId.exp` | High |
| Disabled or removed staff | session ends | **only** if removed from `config/site.ts` and redeployed, or `SESSION_SECRET` is rotated. Clearing `pin_hash` doesn't end live sessions (up to 8 h) | `lib/auth.ts:34-46` | High (F-05) |

**Mass-assignment check:** `/api/book` reads only named fields. `price`, `duration` and `status` from the browser are ignored; `price` and `duration` come from `config/site.ts` (`book/route.ts:65-75`). I tested this locally: a body with `price: 0` is still sent to the RPC with the config price. The `ref` is generated in the database. **CONFIRMED IN CODE.**

---

## 4. Protections already in place (credit where due)

1. **The privileged key never reaches the browser.** It's only in `lib/supabase.ts`, protected by `server-only`. The built browser bundle contains no Supabase client or URL. **CONFIRMED IN CODE.**
2. **No secrets in git history.** Scanning every commit on every branch found no real JWT or `sb_secret_` key. The only match is the placeholder in `.env.example`. `.env*.local` is gitignored and was never committed. **CONFIRMED.** (The local `.env.local` holds a placeholder service key 5 characters long, not a real key.)
3. **Locked database by default.** RLS is enabled on all three tables with no policies, and the booking RPC is revoked from `anon`, `authenticated` and `public`. Proven locally: an anonymous user sees 0 bookings and 0 PIN hashes and cannot write. **REPRODUCED LOCALLY.**
4. **No double bookings, enforced by the database.** A GiST exclusion constraint covers `(barber =, slot &&)` where `status='confirmed'`. The slot is a real time range in Africa/Tunis built from the actual duration, so services of different lengths are covered. **REPRODUCED LOCALLY** (section 6).
5. **Server-trusted prices and durations.** The browser can't set price, duration or status. **CONFIRMED IN CODE.**
6. **Server-side authorization on every admin route,** not just hidden buttons. Cross-staff access is blocked at the query or ownership-check level. **CONFIRMED IN CODE.**
7. **Sound session cookie.** httpOnly, `SameSite=Lax`, `Secure` in production. The HMAC is compared in constant time and the token carries no role. With `SameSite=Lax` plus JSON bodies, cross-site form attacks (CSRF) are low risk. `*.vercel.app` is on the Public Suffix List, so other Vercel sites are different "sites". **CONFIRMED IN CODE.**
8. **PINs stored only as bcrypt hashes;** a PIN is never sent back to the browser. **CONFIRMED IN CODE.**
9. **Public endpoints return minimal data:** no personal fields, no booking IDs. **CONFIRMED IN CODE.**
10. **Safe output.** No `dangerouslySetInnerHTML` except one constant inline script in `app/layout.tsx:62-64`. Client names and notes are rendered through React, which escapes them. Phone links use digits-only normalized numbers. No XSS path found. **CONFIRMED IN CODE.**
11. **No SQL injection surface.** All queries use the supabase-js builder or a typed RPC, and there's no string-built SQL in the app. The RPC builds timestamps from typed `date` and `time` values. **CONFIRMED IN CODE.**
12. **Honest failure messages.** A booking is shown as confirmed **only** when the server returns `ok:true`. Network or JSON failures show an error and keep the form data. **CONFIRMED IN CODE** (`Booking.tsx:132-151`).
13. **Lazy reel loading.** The reels carousel loads only the active and next video (`preload="none"` otherwise). **CONFIRMED IN CODE.**
14. **IP can't be faked with a header on Vercel.** Vercel overwrites `X-Forwarded-For`, so the address-based limits can't be bypassed that way. Source: https://vercel.com/docs/headers/request-headers (accessed 2026-10-04: "we currently overwrite the X-Forwarded-For header and do not forward external IPs … to prevent IP spoofing").

---

## 5. Prioritized findings

Security severity and performance priority are rated separately.

### F-01: Admin login: 4-digit PIN with an in-memory, per-address lockout
- **Severity:** **HIGH** if the admin is reachable without Vercel protection; MEDIUM while that protection stays on.
- **Status:** CONFIRMED IN CODE plus REPRODUCED LOCALLY. Whether protection is on: LIVE VERIFICATION REQUIRED.
- **Where:**
  - `lib/auth.ts:50`: PIN must be exactly 4 digits.
  - `lib/auth.ts:62-87`: the lockout lives in a `Map` in process memory.
  - `app/api/barber/login/route.ts:31-49`: key = `login:${ip}:${barberId}`.
  - `scripts/hash-pin.ts:32`.
- **Prerequisite:** the attacker can reach the login endpoint on an admin host. Today that's only the preview alias, which is behind Vercel's preview protection (LIVE VERIFICATION REQUIRED); share links also bypass that protection.
- **Impact:**
  - There are 10,000 possible PINs. The lockout allows 5 tries per address per barber per server instance.
  - It resets when a new instance starts or memory is recycled, and it isn't shared between instances.
  - Anyone with several real addresses (mobile networks, proxies) gets 5 more tries per address.
  - Guessing the **owner** PIN exposes every customer's name, phone number and note, and allows cancelling any booking.
- **Local reproduction:** 5 wrong PINs from one address, then a 6th gives 429. The next 3 attempts from new addresses are accepted again (401, not locked).
- **Minimal fix:**
  - Keep password-based login, but allow and require a real password: at least 10 characters, or a 6+ word passphrase.
  - Store a **per-account** failed-attempt counter and lock time in the database (`barbers.failed_attempts`, `barbers.locked_until`), updated atomically by a server-only RPC, so it holds across instances and addresses.
  - Keep the per-address memory limit as a secondary layer.
- **Possible regression:** staff must set new passwords. A per-account lock can be triggered by an attacker to lock a barber out (temporary denial), so cap the lock time and let the owner reset it in SQL.
- **Verify:** a unit test of the lockout RPC on the local DB, plus 6 failed logins across 3 different spoofed addresses locally, all locked.

### F-02: The server doesn't enforce the booking window, past times, the slot grid or real dates
- **Severity:** MEDIUM (integrity and abuse).
- **Status:** REPRODUCED LOCALLY.
- **Where:**
  - `app/api/book/route.ts:49-61` checks only the date regex, `date < today`, closed day and opening hours.
  - `BOOKING_WINDOW_DAYS` (`config/site.ts:75`) is used only in the browser (`Booking.tsx:39`).
  - The RPC (`migration.sql:117-190`) and the table have no checks on range, grid or price.
- **Impact:** a direct POST can book:
  - 2027 or 2099 (any future date);
  - 10:00 today when it's already 15:40;
  - off-grid times like 10:07, which fragment the day;
  - impossible values (`10:75`, `2027-02-30`), which pass validation and then fail in Postgres as a 500 instead of a clean 400.
- **Local reproduction:** the route handler was run locally with the DB pointed at a closed local port. All of these inputs reached the DB call (status 500 = "passed validation"). A closed Monday and an unknown service were correctly rejected (400).
- **Minimal fix:** in `book/route.ts`:
  - reject dates beyond `today + BOOKING_WINDOW_DAYS - 1`;
  - reject times that aren't real calendar dates or times, or aren't on the `SLOT_MINUTES` grid;
  - for today, reject `start <= now`;
  - better still, accept only times that `generateSlots(...)` would offer.
  - Optionally add `CHECK (price >= 0)` and `CHECK (extract(second from start_time)=0)` as defense in depth.
- **Possible regression:** a booking made just before midnight on the last day of the window, if the server and browser clocks disagree. Use the same `todayTunis()` helper.
- **Verify:** extend the local harness (section 9) so each bad input returns 400.

### F-03: Fake-booking flooding (calendar denial of service)
- **Severity:** MEDIUM.
- **Status:** CONFIRMED IN CODE plus REPRODUCED LOCALLY (rate limit is per address, in memory).
- **Where:**
  - `lib/rateLimit.ts:6-19` (a `Map` in memory, per instance);
  - `book/route.ts:26-32` (5 per 10 min per address);
  - no limit per phone number or per day;
  - no bulk cancel in the dashboard.
- **Impact:**
  - **Anyone:** one person can create about 30 bookings an hour from one address (and more across instances or addresses). With F-02, that reaches beyond the 14 days. Real clients see "Ma3mour" (busy); the owner must cancel each fake booking one by one.
  - **Shared mobile addresses:** many Tunisian mobile users share one public address (carrier-grade NAT, a likely but unmeasured factor), so the same limit may occasionally block real customers.
- **Minimal fix (in order):**
  1. F-02: enforce the window.
  2. In `create_booking`: refuse when the same normalized phone already has ≥ N (e.g. 2) future confirmed bookings, checked inside the same transaction.
  3. Optional: a database-backed per-address counter. A CAPTCHA is optional later and is not a substitute for (1) and (2).
- **Possible regression:** a family booking several haircuts from one phone. Choose N with the owner.
- **Verify:** a local DB test: a 3rd future booking for the same phone gives an error code that maps to 429 or 409.

### F-04: The admin runs only on the preview deployment, which likely uses the production database and key
- **Severity:** MEDIUM (data exposure through untrusted or experimental code, plus a fragile access path).
- **Status:** CONFIRMED IN CODE (`middleware.ts:6`, README:67-70). The environment scoping is SUSPECTED (the service key was added to the Preview environment during this project) and needs LIVE VERIFICATION.
- **Impact:**
  - Every push to `preview` instantly changes the code that holds the production service-role key and serves real staff.
  - Preview protection means staff need a Vercel login or a **share link** (a bearer URL; one was shared in chat on 2026-10-03, valid about 23 h).
  - Removing the protection to let staff in makes F-01 decisive.
  - `ADMIN_HOSTS` is hiding, not access control.
- **Minimal fix (owner decision):**
  - **Option A:** serve the admin from production (`ADMIN_HOSTS` set to the production domain), after F-01. Give Preview its **own** Supabase project or no service key.
  - **Option B:** keep the admin on preview, but freeze the `preview` branch as admin-only and never deploy experiments there.
- **Possible regression:** staff bookmark changes.
- **Verify:** the Vercel env-scope check in section 10.

### F-05: Sessions can't be revoked
- **Severity:** LOW–MEDIUM.
- **Status:** CONFIRMED IN CODE.
- **Where:** `lib/auth.ts:28-46` (a stateless 8 h token); `logout/route.ts:8` (only clears the cookie); PIN changes don't affect existing tokens.
- **Impact:** a stolen or leftover cookie works for up to 8 h after logout, a PIN change, or "disabling" a barber by clearing `pin_hash`.
- **Minimal fix:** add `barbers.session_version int` and put it in the token. Compare it on each admin request (one extra small query, or fold it into the existing query). Increase it on password change, disable, or "log out everywhere".
- **Verify:** a local test: issue a token, bump the version, and the next request gives 401.

### F-06: No security headers
- **Severity:** LOW.
- **Status:** REPRODUCED LOCALLY (`next start`); production LIVE VERIFICATION REQUIRED.
- **Where:** `next.config.ts:3-5`. The responses include `X-Powered-By: Next.js` and no `X-Frame-Options`, `frame-ancestors`, `X-Content-Type-Options` or `Referrer-Policy`.
- **Impact:** `/barber` can be framed by another site (clickjacking of the PIN pad, only after the Vercel protection is passed), and the response gives a small hint about the tech stack.
- **Minimal fix:** `headers()` in `next.config.ts`:
  - `X-Frame-Options: DENY` plus `Content-Security-Policy: frame-ancestors 'none'`;
  - `X-Content-Type-Options: nosniff`;
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - `poweredByHeader: false`.
- A full CSP should wait: there's an inline script (`layout.tsx:62`) and animation libraries.
- **Verify:** `curl -I` locally.

### F-07: A barber's absence block and a booking can be created at the same instant
- **Severity:** LOW.
- **Status:** REPRODUCED LOCALLY.
- **Where:** `migration.sql:147-159` (a count-then-insert check without a lock); `block/route.ts:47` (no overlap check).
- **Impact:** a booking can coexist with an absence created in the same second. Separately, by design, a barber can block over an existing booking and nothing warns them.
- **Minimal fix (optional):** in the RPC and the block insert, `pg_advisory_xact_lock(hashtext(barber))` on the same key. It's per barber, so other barbers aren't blocked. Also warn the barber when a block overlaps bookings.
- **Verify:** the local two-session test (section 6, C6) yields an error instead of an overlap.

### F-08: A network timeout after a successful booking leaves an unknown "ghost" booking
- **Severity:** LOW (correctness and UX).
- **Status:** CONFIRMED IN CODE.
- **Where:** `Booking.tsx:126-151`; no idempotency key in `/api/book` or the RPC.
- **Impact:** the server saves the booking but the response is lost. The client sees "Mochkla fel réseau" (network problem) and retries, gets `SLOT_TAKEN` from **its own** booking, and assumes it failed. The booking still exists with no ref known to the client.
- **Minimal fix:**
  - The client generates a UUID per form submission and sends it as `request_id`.
  - Add a nullable unique column `bookings.request_id`.
  - On `unique_violation` for that key, the RPC returns the existing `{id, ref}`.
  - A retry then shows the same ticket.
- **Verify:** a local DB test: calling the RPC twice with the same `request_id` returns the same ref.

### F-09: Staff dashboard ignores failed actions
- **Severity:** LOW.
- **Status:** CONFIRMED IN CODE.
- **Where:** `app/barber/page.tsx:202-207` (`act`), `:405-421` (`create`), `:424` (`remove`). The response status is never checked, and network errors become unhandled promise rejections.
- **Impact:** a hajem may believe a cancellation worked when it didn't. A client then shows up for a "cancelled" slot, or the slot is never freed.
- **Minimal fix:** check `res.ok` and show an error message; don't reload the list as if it succeeded.

### F-10: The database trusts its single caller completely
- **Severity:** LOW (defense in depth).
- **Status:** REPRODUCED LOCALLY.
- **Impact:** as `service_role`, the RPC accepts `2001-01-01 03:00`, `2099-12-31` and a price of `-5`. Today only the server can call it (good). But any future server bug or new route would write bad data unchecked.
- **Minimal fix:** cheap `CHECK` constraints:
  - `price >= 0`;
  - `length(client_name) between 2 and 60`;
  - `phone ~ '^216[0-9]{8}$'`;
  - `date >= '2025-01-01'`.
- **Possible regression:** existing test rows that violate them. Check with the read-only queries in section 10 first.

### F-11: Extensions may be installed in the `public` schema
- **Severity:** LOW / INFO.
- **Status:** SUSPECTED. On Supabase, `pgcrypto` usually already lives in `extensions`; `btree_gist` would be created in `public` (`migration.sql:8-9`).
- **Impact:** extension functions in `public` are callable by `anon` through the Data API. Locally, `anon` could call `gen_random_uuid()`. This only costs compute; no data is exposed. Supabase's advisor flags it as "extension in public".
- **Minimal fix:** `create extension ... with schema extensions`. Moving an existing extension needs care; the GiST constraint depends on it.

### F-12: No data-retention policy or customer notice
- **Severity:** INFO (governance).
- **Status:** CONFIRMED IN CODE (no deletion path; no privacy text on the site).
- **Decision needed:**
  - how long to keep names and phone numbers after the appointment (e.g. anonymize after N months);
  - what short notice to show next to the booking form.
- I don't make any legal claim here.

### F-13: Minor items
- **Status:** all INFO, CONFIRMED IN CODE.
- **Cookie flags on logout:** the logout cookie is cleared without the `httpOnly`/`secure` attributes (`logout/route.ts:8`). Harmless.
- **Two sources of truth for the owner role:** `barbers.is_owner` is in the database, but the code uses `config/site.ts`. Keep them in sync or drop one. The database seed also names `imed` as "IMED" while the site shows "BAFFI".
- **Messy 500 errors:**
  - an action ID that isn't a UUID, or an invalid block date, causes a Postgres error → 500 instead of 400;
  - availability for arbitrary far dates returns 500 when the date is invalid.
- **PIN shown on screen:** `npm run hash-pin <pin>` puts the PIN in shell history.
- **README out of date:**
  - README:108 still mentions a footer link « Espace barber 🔒 », which was removed;
  - README:192-193 presents the lockout as absolute;
  - README:77 shows the old name `IMED`.

### Dependencies
`npm audit` (2026-10-04) on production dependencies: `postcss` (high) through `next`, and `sharp` (high, libvips/libheif).

| Package | Reachable in production? | Why |
|---|---|---|
| `postcss` | No | Processes only this repo's own CSS at build time; attacker-controlled CSS never reaches it. |
| `sharp` | No | Exploitable only by decoding attacker images; there are no uploads, and the images are the repo's own static files. |
| `braces`, `micromatch`, `chokidar` (all deps) | No | Dev and build tooling only. |

**No action is required now.** Take Next.js patch releases within 15.x when they appear. The audit's suggested fix is a **major** upgrade to Next 16, so don't take it just because of these advisories.

---

## 6. Booking integrity and concurrency

**Mechanism (CONFIRMED IN CODE):**
- **Slot computation:** the `trg_compute_booking_slot` trigger converts `date + start_time` in Africa/Tunis to a `tstzrange [start, start + duration)`.
- **Exclusion constraint:** `bookings_no_overlap EXCLUDE USING gist (barber WITH =, slot WITH &&) WHERE status='confirmed'` rejects any overlap atomically at insert time.
- **Conflict response:** the RPC turns the violation into `SLOT_TAKEN` → HTTP 409, the UI reloads the slots and asks the user to pick another time.
- **Slot model:** the grid is 30 min, but stored durations are exact (15/30/45/60). A **unique start-time** constraint would **not** be enough: a 60-min booking at 10:00 and a 30-min one at 10:30 have different starts but overlap. The range-exclusion design is the right one and is already in place.
- **Statuses:** only `confirmed` blocks time; `done` and `cancelled` free it. Marking "done" early frees the rest of that slot. That's acceptable, but worth knowing.

**Local tests (REPRODUCED LOCALLY, PostgreSQL 16.14, migration applied unmodified, synthetic rows):**

| Test | Setup | Result |
|---|---|---|
| C1 | 20 parallel `create_booking` calls, same barber, same 10:00, durations 30/45/60 | **1 success, 19 `SLOT_TAKEN`, 0 other errors** |
| C2 | 20 parallel calls, same barber, starts 09:30–10:45, durations 15–60 | 3 non-overlapping rows kept; **overlapping confirmed pairs = 0** |
| C3 | barber A's transaction held open for 3 s; barber B books the same time with `lock_timeout=200ms` | B **succeeded immediately**, so different barbers don't block each other |
| C3b | same barber while the first transaction is still open | the second waits (here it timed out after 200 ms); **no double booking** |
| C4 | 11:00–11:30, then 11:30–12:00 | both accepted (half-open ranges allow back-to-back bookings) |
| C5 | cancel the 11:00 booking, rebook 11:00 | accepted |
| C6 | booking transaction open, the barber inserts an absence over that time | **both committed → 1 overlap** (F-07) |
| C7 | the RPC directly with a past date, 2099, 03:00, negative price | **accepted** (F-10) |
| C8 | Tunis offset | 03:00 local is stored as 02:00 UTC (UTC+1, no DST), correct |

**Other behavior:**

| Area | Assessment |
|---|---|
| **Lock contention** | Locking is per barber (index-level on that barber's ranges); there's no table-wide lock. A slow transaction only delays other bookings for the same barber's overlapping time. No deadlock risk was found: a single statement per transaction, with no multi-row lock ordering. |
| **Double click** | The button is disabled while `submitting` (`Booking.tsx:35,431`). A double submit that slips through gets `SLOT_TAKEN` from the database, never a duplicate. |
| **Timeout after success** | See F-08 (ghost booking). |
| **Timezone** | `todayTunis()` and `nowMinutesTunis()` use `Intl` with `Africa/Tunis`, and the database uses `AT TIME ZONE 'Africa/Tunis'`. They're consistent; there's no hard-coded offset. |
| **Server-side checks present** | barber and service exist, closed day, opening hours (start and end), not a past day. |
| **Server-side checks missing** | booking window, past time today, slot grid, valid calendar date, overlap with blocks under concurrency (F-02, F-07). |
| **Barber/service association** | There's no per-barber service list in the code; every barber offers every service. N/A. |

**Proposed automated concurrency test (to add to the repo, not run as part of the repo yet):**
- **Setup:** a disposable Postgres, `migration.sql`, stub roles `anon`, `authenticated` and `service_role`.
- **Run:** `N=20` parallel `create_booking` calls over random overlapping intervals for 2 barbers.
- **Invariant:** `SELECT count(*) FROM bookings a JOIN bookings b ON a.barber=b.barber AND a.id<b.id AND a.slot && b.slot AND a.status='confirmed' AND b.status='confirmed'` = 0.
- Every non-success must be `SLOT_TAKEN`.

---

## 7. Query inventory and ranked resource optimizations

Every database call goes through the Supabase HTTP API (PostgREST). There are no direct Postgres connections, so connection pooling and serverless connection limits are **N/A**.

| # | Flow | Call site | Query pattern | Trigger and frequency | Rows / bounds | Index used | Avoidable calls | Cost driver | Optimization candidate |
|---|---|---|---|---|---|---|---|---|---|
| Q1 | LIVE widget | `next-slots/route.ts:18-30` | `bookings` (barber, date, start_time, duration_min) where date in [today, today+6] and status='confirmed', plus `blocked_slots` for the same range | **on page load, then every 60 s per open tab, forever, including hidden tabs** (`LiveSlots.tsx:41-44`) | ≤ 7 days of bookings for all barbers (normal ≤ ~210 rows, about 60 B each) | none leading on `date` → sequential scan (trivial while small) | **Yes:** hidden-tab and long-idle polls; identical result for every visitor | Vercel function invocations, plus 2 Supabase requests per poll | Stop polling when `document.hidden`; stop after ~10 min; add `Cache-Control: public, s-maxage=30, stale-while-revalidate=30` (public data only; the booking stays authoritative in the database) |
| Q2 | Availability | `availability/route.ts:34-46` | `bookings` (start_time, duration_min) where barber=, date=, status=confirmed, plus blocked_slots where barber=, date= | each step-4 view or date change (~2–4 per booking session) | ≤ ~22 rows | `bookings_barber_date_idx`, `blocked_barber_date_idx` | no | small | none needed; must **not** be cached for long |
| Q3 | Booking | `book/route.ts:65` → RPC | block check (count on barber+date) + INSERT (GiST constraint check) | once per booking (+ retries after 409) | 1 row | btree (barber, date) and GiST (barber, slot) | no | small | none |
| Q4 | Dashboard (staff) | `bookings/route.ts:28-39` | 12 columns where date>=today, status<>'cancelled', barber=, order by date, start_time | each dashboard open or action reload | **unbounded future** (bounded by the window once F-02 is fixed; at most ~22×14 rows per barber) | (barber, date) btree | no | small | none after F-02 |
| Q5 | Dashboard (owner, all) | same, without the barber filter | | toggle "all" and reloads | all barbers' future bookings | no index leading on `date` → sequential scan of the whole table, **which grows forever without retention** | no | table size over time | after a retention policy, nothing; otherwise a `(date)` index later, if live stats show sequential-scan cost |
| Q6 | Blocks | `bookings/route.ts:42-50` | blocked_slots date>=today [barber=] | each dashboard load | small | (barber, date) | no | negligible | none |
| Q7 | Owner stats | `bookings/route.ts:58-63` | (barber, date, status) for 7 days, counted in JS | each owner dashboard load | ≤ ~1 week of rows | none leading on date | slightly (rows fetched just to count) | negligible | optional `count` with `head:true` per barber; not worth it now |
| Q8 | Login | `lib/auth.ts:52-56` | barbers.pin_hash by primary key | each login attempt | 1 row | primary key | no | bcrypt CPU on Vercel | none |
| Q9 | Action | `action/route.ts:35-53` | SELECT by ID, then UPDATE by ID | each done or cancel | 1 row | primary key | could be a single `update ... where id= and (barber=me or owner)` | negligible | optional |
| Q10 | Block create/delete | `block/route.ts` | INSERT / DELETE by ID and barber | rare | 1 row | primary key | no | negligible | none |

**Indexes:**
- **Present:** `bookings_pkey`, `bookings_ref_key` (unique, used by the retry loop), `bookings_barber_date_idx`, `bookings_no_overlap` (GiST, partial), `blocked_slots_pkey`, `blocked_barber_date_idx`.
- **Redundancy:** none. The btree (barber, date) serves equality and range listing; the GiST serves overlap. RLS has no policies, so there are no per-row policy costs.
- **Missing (optional):** an index leading on `date`, for Q1 and Q5, **only** if live `pg_stat_statements` or `EXPLAIN` on production-sized data shows a meaningful cost. At about 11k rows a year it's unlikely.

**Client-side efficiency:**
- One Supabase client per server instance (singleton).
- No fetch loops, effect cycles or leaked listeners found. Booking effects depend on `[step, loadSlots]` and only fetch at step 4.
- The only leak-like pattern is the **perpetual polling** in Q1.
- No N+1 queries, no `SELECT *`, no exact counts.

**Ranked resource optimizations:**
1. **R-1, highest priority: polling in Q1.** Pause on hidden tabs, cap the duration, add a short public CDN cache. This removes most avoidable Vercel invocations and Supabase requests.
2. **R-2: Vercel bandwidth.** The cinematic intro preloads all **408 frames** (5.7 MB desktop, 3.9 MB mobile) on every visit, even if the visitor never scrolls (`CinematicIntro.tsx:11,57-72`). Load chapter 1 first and the rest once the user scrolls; consider half the frames on mobile. This is a **Vercel** cost, not Supabase.
3. **R-3: retention policy (F-12).** Keeps the bookings table, and Q5's sequential scans, small for good.
4. **R-4: F-02 window enforcement.** Bounds Q4 and Q5 result sizes and blocks unbounded spam rows.

---

## 8. Supabase Free capacity, operational risks and sources

**Official limits** (fetched 2026-10-04 from https://supabase.com/pricing; re-check before launch):

| Resource | Free plan |
|---|---|
| Database | 500 MB, shared CPU, 500 MB RAM |
| Egress | 5 GB (plus 5 GB cached egress) |
| File storage | 1 GB (unused) |
| Realtime | 200 concurrent connections, 2M messages (unused) |
| Edge functions | 500k invocations (unused) |
| Projects | 2 active |
| Inactivity | **paused after 1 week of inactivity** |
| Backups | **no automatic backups** |
| Logs | 1-day retention |

**Vercel Hobby** (https://vercel.com/docs/limits/fair-use-guidelines, last updated 2026-09-14, accessed 2026-10-04):

| Resource | Included per month |
|---|---|
| Fast Data Transfer | 100 GB |
| Function invocations | 1,000,000 |
| Fast Origin Transfer | 10 GB |
| Active CPU | 4 hours |

> "Hobby teams are restricted to non-commercial personal use only … Advertising the sale of a product or service" counts as commercial use.

**This barber site is commercial use. That is a separate launch blocker, recorded here and not resolved.**

### Estimates (all assumptions are labeled; nothing here is measured)

**Assumptions:**

| ID | Assumption |
|---|---|
| A1 | Average homepage session is 3 min, so 4 `/api/next-slots` calls per visitor |
| A2 | 3 availability lookups per booking session |
| A3 | Static transfer per visitor is about 7.5 MB (intro frames 3.9–5.7 MB + images + 1–2 reels) |
| A4 | About 1 KB of storage per booking row including indexes |
| A5 | 4 staff each open the dashboard about 10 times a day (3 queries per load) |
| A6 | Supabase response bytes for Q1 average about 5 KB (12.6 KB worst case) |

**Normal day (100 visitors, 30 bookings):**

| Source | Calculation | Result |
|---|---|---|
| Anonymous browsing | 100 × 4 = 400 Vercel invocations | 800 Supabase requests; ≈ 4 MB egress |
| Booking flow | 30 × 3 availability × 2 queries = 180, plus 30 RPCs | ≈ 210 requests |
| Staff dashboard | 40 loads × 3 queries | ≈ 120 requests |
| **Total** | | **≈ 1,130 Supabase requests/day ≈ 34k/month**; egress well under 0.2 GB/month (**about 3% of 5 GB**) |
| Database growth | 30 × 1 KB | ≈ 0.9 MB/month ≈ **11 MB/year** (about 2% of 500 MB) |
| Vercel transfer | 100 × 7.5 MB × 30 | ≈ **22 GB/month (about 22% of 100 GB)** |

**Hypothetical advertising spike (5,000 visitors in one day, same assumptions):**

| Source | Result |
|---|---|
| Vercel invocations | 5,000 × 4 = 20k |
| Supabase | 40k requests, ≈ 0.2 GB egress |
| Vercel transfer | ≈ 37 GB in **one day** (about 37% of the monthly Hobby allowance) |

**Hypothetical abandoned tabs (from R-1):**

| Case | Result |
|---|---|
| One tab left open 24 h | 1,440 invocations and 2,880 Supabase requests |
| 20 such tabs for a month | ≈ 864k invocations, about **86% of Vercel's 1M** |

**Most plausible bottleneck:** **Vercel Fast Data Transfer** (media), then **Vercel invocations from polling**. Supabase's database size and egress are unlikely to be the constraint at this scale.

**What needs real measurements:**
- the real session length and the share of users who reach the reels;
- Supabase compute (CPU and RAM) under bursts;
- actual response sizes;
- whether the project gets paused during quiet weeks.

No maximum safe number of users can be stated from the repository alone.

### Failure handling

| Scenario | Current behavior |
|---|---|
| Database unavailable or paused | `/api/book` returns 500 "Erreur serveur", and the client shows the error and keeps the form. **A failed booking is never shown as confirmed** (good). Availability shows "Mochkla fel chargement". The LIVE widget shows its error state. |
| Timeouts | There's no explicit fetch timeout or abort in the client. A hung request leaves "Jari…" (in progress) until the platform times out. No automatic retries (good: no duplicate writes), but F-08 still applies to manual retries. |
| Limiter failure | The memory limiter never fails closed; it simply resets when an instance restarts. It doesn't protect across instances. |
| Bypassing the app's limits | **Not possible through the Data API**, assuming the deployed RLS and revokes match the repository (section 10). |

### Backups and retention
- The Free plan has no automatic backups. **Operational step:** a periodic manual export, using `pg_dump` with the database connection string or the dashboard export.
- Keep the connection string out of git, and store exports encrypted, off any shared drive.
- Restore needs to be practiced once on a scratch project.
- Do **not** rely on synthetic "keep-alive" traffic as an availability plan. Pausing after 1 week of inactivity is unlikely while real bookings happen, but it should be checked on the dashboard.

---

## 9. Tests run and their results

| Command / test | Result |
|---|---|
| `git status` | clean |
| `npx tsc --noEmit` | PASS |
| `npm audit --omit=dev` and `npm audit` | 3 production advisories (2 high, 1 moderate), 8 in total; reachability in section 5 |
| `next lint` | **SKIPPED**: no ESLint config, so it would launch an interactive setup |
| Secret scan (git history every branch, `.next/static`, env names) | no real secrets; values never printed |
| Local Postgres 16.14 (disposable cluster in the session scratchpad, Unix socket only), `migration.sql` applied twice | PASS (re-runnable) |
| Role `anon`: SELECT bookings and barbers, read `pin_hash`, INSERT, UPDATE, call `create_booking` | 0 rows / 0 rows / RLS error / 0 rows affected / permission denied (**secure**) |
| Role `anon`: call `gen_random_uuid()` | allowed (F-11) |
| Concurrency C1–C8 | section 6 |
| Route handler harness (`/api/book`, `/api/barber/login` run in-process with `tsx`; Supabase URL pointed to `127.0.0.1:9`, a closed port, so **no network database access was possible**) | F-02 and F-03 inputs pass validation; 6th booking from the same address → 429; rotating addresses → never limited (in-process; on Vercel the address can't be faked by a header, but multiple real addresses still bypass it); login lockout after 5, rotating addresses unlocked |
| `next start` locally (fake env): headers, admin API without a cookie, forged cookie, wrong Host | no security headers, `X-Powered-By` present; 401; 401; 404 |

**Not verified:**
- the deployed RLS, grants, function privileges and extension schema;
- the Vercel Deployment Protection state and active share links;
- the Vercel env var scopes (Preview versus Production) and whether `ADMIN_HOSTS` is set;
- the production response headers;
- real usage and egress figures;
- Supabase pause status;
- the API key type (legacy `service_role` JWT or `sb_secret_`);
- whether test bookings exist in production.

Successful typecheck and tests do not prove that the deployed authorization matches.

---

## 10. Live-verification checklist (prepared, **not executed**)

### Supabase (SQL editor, read-only catalog queries; no customer rows are read)

```sql
-- 1. RLS enabled on each table (expect true / true / true, forced optional)
select relname, relrowsecurity, relforcerowsecurity
from pg_class where relnamespace = 'public'::regnamespace
  and relname in ('bookings','barbers','blocked_slots');

-- 2. Policies (expect ZERO rows)
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public';

-- 3. Table grants to API roles (grants may exist; with RLS + no policy they return nothing)
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' and grantee in ('anon','authenticated')
order by 1,2,3;

-- 4. Function execute privileges (expect create_booking: only postgres/service_role)
select p.proname, pg_get_function_identity_arguments(p.oid) args,
       p.prosecdef as security_definer, p.proconfig,
       has_function_privilege('anon', p.oid, 'execute') anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') auth_exec
from pg_proc p where p.pronamespace='public'::regnamespace
order by 1;

-- 5. Constraints (expect bookings_no_overlap EXCLUDE ... WHERE status='confirmed')
select conname, contype, pg_get_constraintdef(oid)
from pg_constraint where conrelid in ('public.bookings'::regclass,'public.blocked_slots'::regclass);

-- 6. Indexes
select tablename, indexname, indexdef from pg_indexes
where schemaname='public' order by 1,2;

-- 7. Trigger present
select tgname, tgenabled from pg_trigger
where tgrelid='public.bookings'::regclass and not tgisinternal;

-- 8. Extension schemas (F-11)
select extname, extnamespace::regnamespace from pg_extension
where extname in ('btree_gist','pgcrypto');

-- 9. Table sizes only (no row content)
select relname, pg_size_pretty(pg_total_relation_size(oid))
from pg_class where relnamespace='public'::regnamespace and relkind='r';
```

**Supabase dashboard:**
- **Security Advisor:** expect "RLS enabled, no policies" as info; "extension in public" possible.
- **API settings:** the exposed schemas, and which key type the server uses.
- **Usage:** egress, database size.
- **Pause status.**
- **Backups:** confirm none exist, and plan exports.

### Vercel (dashboard)
- **Deployment Protection** for Preview: is it on? Are there active **Shareable Links**? Revoke old ones.
- **Environment Variables:**
  - which environments have `SUPABASE_SERVICE_ROLE_KEY` and `SESSION_SECRET`;
  - whether Preview and Production share the same values;
  - whether `ADMIN_HOSTS` is set.
- **Response headers** on production `/` and preview `/barber` (open DevTools → Network once, normally).
- **Usage:** Fast Data Transfer and Function Invocations for the current month.
- **Plan terms:** Hobby non-commercial restriction (launch decision).

---

## 11. Phased remediation plan

### Phase 1: launch blockers (access control first)
1. **F-01:** admin password strength, plus a per-account lockout stored in the database.
2. **F-05:** session revocation (`session_version`). Small, and it fits naturally with F-01.
3. **F-02:** server-side booking validation (window, past time, grid, real dates) → clean 400s.
4. **F-03:** a per-phone cap on future bookings inside the RPC.
5. **F-04 (decision plus configuration):** where the admin lives, and separate the Preview database or key.

### Phase 2: material efficiency fixes
1. **R-1:** pause and cap the LIVE polling; short public CDN cache on `/api/next-slots`.
2. **R-2:** lazy and progressive loading of the intro frames (Vercel bandwidth).

### Phase 3: operational setup
1. Backups: a manual export routine and one test restore.
2. Retention decision and implementation (F-12), plus a short customer notice.
3. Run section 10 and record the results; revoke stale share links.
4. Vercel commercial-use plan decision (outside the technical scope).

### Phase 4: optional polish
- F-06 security headers;
- F-07 per-barber advisory lock;
- F-08 idempotency key;
- F-09 dashboard error handling;
- F-10 CHECK constraints;
- F-11 extension schema;
- F-13 cleanups and README corrections.

The first bounded phase is in `docs/audits/NEXT_CONTROLLED_IMPLEMENTATION_PROMPT.md`.
