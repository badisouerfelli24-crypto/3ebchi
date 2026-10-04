# Next controlled implementation phase: admin login hardening (F-01 + F-05)

> **Copy everything below the line into a new session as the prompt.** It is derived from
> `docs/audits/SECURITY_DATABASE_AUDIT.md` (2026-10-04). It has **not** been executed.

---

You are working in the 3EBCHI STYLE barber booking repository (Next.js 15 App Router + Supabase, server-only service-role access). Read `docs/audits/SECURITY_DATABASE_AUDIT.md` first, especially findings **F-01** (4-digit PIN with an in-memory, per-address lockout) and **F-05** (stateless sessions that can't be revoked). Implement **only** this bounded phase.

## Objective
1. **Passwords instead of 4-digit PINs.** Replace the 4-digit PIN with a **password** of at least 10 characters (any characters, at most 128). Login stays password-based; no MFA.
2. **Per-account lockout in the database.** Add a lockout that is shared by every server instance and every network address:
   - after **5** consecutive failures for a barber, lock that barber's login for **15 minutes**;
   - store it in the database and update it atomically;
   - keep the existing in-memory per-address limiter as a secondary layer.
3. **Revocable sessions.** Add a `session_version` per barber, included in the signed token and checked on every authenticated request.
   - It is incremented whenever a password is changed, so old sessions stop working.
   - Document a one-line SQL "log out everywhere" step for the owner.

## Allowed files
- `supabase/migration.sql`: **append-only** additive section (see Migration safety).
- `lib/auth.ts`
- `app/api/barber/login/route.ts`
- `app/api/barber/logout/route.ts`: clear the cookie with the same attributes (`httpOnly`, `secure`, `sameSite`, `path`).
- `app/api/barber/bookings/route.ts`, `app/api/barber/action/route.ts`, `app/api/barber/block/route.ts`: only to switch to the new session check helper.
- `app/barber/page.tsx`: **login form only**:
  - a text password field with `autocomplete="current-password"`;
  - no 4-digit limit, no numeric-only filtering;
  - show the server's lockout message.
  - Do not change the dashboard.
- `scripts/hash-pin.ts`, or rename it to `scripts/hash-password.ts` and update the `package.json` script name:
  - accept the password **from stdin or an interactive prompt, not a command-line argument**, so it doesn't land in shell history;
  - require ≥ 10 characters;
  - bcrypt cost ≥ 12.
- `README.md`: the password-change section only, the lockout description, and the "log out everywhere" SQL.
- New test files under a new `tests/` folder (see Targeted tests). Add a `test` script to `package.json` **only** if you can do it without adding dependencies; otherwise document how to run the tests with the existing `tsx`.

## Excluded changes (do not touch)
- Booking flow, availability, the LIVE widget, prices, intro, reels, styling, any public page.
- `middleware.ts` and `ADMIN_HOSTS` (finding F-04 is a separate owner decision).
- Booking validation (F-02 and F-03), security headers, idempotency: these are later phases.
- No new npm dependencies, no dependency upgrades, no lockfile changes.
- No Supabase Auth, no MFA, no email or SMS, no CAPTCHA, no external services.

## Design requirements
- **Columns:** add these to `public.barbers`:
  - `failed_attempts int not null default 0`
  - `locked_until timestamptz`
  - `session_version int not null default 1`
- **Server-only RPCs.** Add two functions (`language plpgsql`, `set search_path = public`, fully qualified table names, **security invoker**). Revoke execute from `public, anon, authenticated` and grant it to `service_role`:
  - **`login_check_lock(p_barber text)`** returns the remaining lock seconds (0 if unlocked).
  - **`login_record_result(p_barber text, p_success boolean)`**, atomic:
    - on failure, increment `failed_attempts` and set `locked_until = now() + interval '15 minutes'` when it reaches 5 (then reset the counter);
    - on success, reset `failed_attempts` to 0 and `locked_until` to null;
    - return the current `session_version`.
- **Login order:**
  1. check the database lock (reject with 429 if locked);
  2. check the memory limiter;
  3. verify with bcrypt;
  4. record the result;
  5. on success, issue the token.
- **Same answer for every wrong case:** an unknown barber, a missing hash and a wrong password must all return the **same** generic 401 message. Run bcrypt against a dummy hash when there's no hash, to keep timing similar.
- **Token format:** `barberId.sessionVersion.exp.hmac`.
  - On each authenticated request, verify the HMAC and the expiry, then load the barber's `session_version` (a single primary-key select, or reuse an existing query).
  - Reject with 401 on a mismatch.
  - Keep the 8 h TTL.
  - Old-format tokens must be rejected cleanly (401, not 500).
- **Owner role:** keep reading it from `config/site.ts` as today. Do not trust anything from the request.
- **Error codes:** a lock returns **429** with the remaining minutes. Never reveal whether the barber exists or has a password set.

## Migration safety and rollback
- **Additive only:** `alter table ... add column if not exists ...`, `create or replace function`, `revoke`/`grant`. No `drop`, no data rewrites, no changes to `bookings` or `blocked_slots`.
- **Re-runnable:** the new section must be safe to run twice.
- **Rollout order to document in the README; do not perform it yourself:**
  1. Apply the SQL.
  2. Set the new password hashes with `update public.barbers set pin_hash = '<bcrypt>', session_version = session_version + 1 where id = '<barber>';`. The column name `pin_hash` can stay to avoid a rename.
  3. Deploy the code.
- **Rollback:** redeploy the previous commit. The new columns and functions are unused by the old code and can stay.

## Targeted tests (run locally only)
Use a **disposable local PostgreSQL** with synthetic data. PostgreSQL 16 binaries exist at `/usr/lib/postgresql/16/bin`.
- Create the cluster under the session scratchpad on a Unix socket.
- Create stub roles `anon`, `authenticated` and `service_role` (with `bypassrls`).
- Apply `supabase/migration.sql` twice.

Then prove each of these:
1. **Lockout:** 5 failures lock the account, regardless of how many different addresses or instances were used. The 6th returns locked; after `locked_until` passes (simulate by updating it), login works again.
2. **Reset on success:** a success resets the counter.
3. **Privileges:** `anon` and `authenticated` get "permission denied" on both new RPCs; the `barbers` table still returns 0 rows to `anon`.
4. **Revocation:** a token issued at version 1 is rejected after bumping to version 2.
5. **Old tokens:** an old 3-part token gives a clean 401.

For the route handlers, run them in-process with `tsx`. Point `NEXT_PUBLIC_SUPABASE_URL` at a **closed local port** or a local PostgREST if one is already available. Never point it at the real project.

Also run: `npx tsc --noEmit` and `npm run build` (with placeholder env values; the build does no live data fetching).

## Acceptance criteria
- The tests above pass locally, and you record the commands and outputs.
- The typecheck and build pass.
- The login UI accepts a password, shows the lockout message, and the dashboard is unchanged.
- No secret, hash or password is printed in logs, test output or commit messages.
- `git diff` touches only the allowed files.

## Explicit prohibitions
- **Do not deploy.** Do not push to `main`. Do not push at all unless the user asks; if asked, push only to a new feature branch.
- **Do not apply migrations** to the real Supabase project. Do not run SQL against it. Do not change Vercel or Supabase settings or environment variables.
- **Do not read, print, rotate or use real credentials.** Do not send requests to the deployed site's login, booking or admin endpoints.
- **Do not delete or modify existing data.** Do not commit `.env*` files.
- **Stop and report if any change outside the allowed files seems necessary.**
