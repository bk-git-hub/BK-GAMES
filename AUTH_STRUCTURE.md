# BK Games Authentication Structure

Last updated: 2026-06-05

This document explains how Better Auth is wired into BK Games and what is intentionally left for later work.

## Goal

The current auth layer answers one question:

```text
Who is this user?
```

It does not yet answer every authorization question:

```text
What is this user allowed to do?
```

Authorization for wallet ownership, table actions, and admin operations will be enforced in later service layers.

## Current Scope

Implemented now:

- Email/password authentication.
- Better Auth API route in the Next.js app.
- Better Auth server instance backed by PostgreSQL through Drizzle.
- Better Auth React client helper.
- Basic sign-in/sign-up page.
- Home page session display and sign-out button.
- Root `.env` loading for package-level Drizzle commands and DB client usage.

Not implemented yet:

- OAuth providers.
- Email verification.
- Password reset email flow.
- Admin role enforcement.
- Wallet creation on signup.
- Game-server Socket.IO authentication.
- Game token issuance for realtime socket handshakes.

## Package Dependencies

The web app owns the Better Auth dependency:

- `better-auth`
- `@better-auth/drizzle-adapter`

The database package owns Drizzle and PostgreSQL access:

- `drizzle-orm`
- `drizzle-kit`
- `pg`

The root `package.json` pins `kysely` to `0.28.17` through a pnpm override.

Reason:

- Better Auth `1.6.14` imports Kysely migration constants through its bundled Kysely adapter.
- The initially resolved `kysely@0.29.2` caused the Next.js Turbopack production build to fail because those constants were not exported from the root module.
- Pinning `kysely@0.28.17` keeps Better Auth, its Kysely adapter, and the production build aligned.

## File Map

Server auth instance:

- `apps/web/src/lib/auth.ts`
- Explicit auth base path: `/api/auth`

Client auth helper:

- `apps/web/src/lib/auth-client.ts`
- Explicit auth base path: `/api/auth`

Next.js auth route:

- `apps/web/src/app/api/auth/[...all]/route.ts`

Auth UI:

- `apps/web/src/app/auth/page.tsx`
- `apps/web/src/app/auth/auth-form.tsx`
- `apps/web/src/components/auth/sign-out-button.tsx`

Database schema:

- `packages/db/src/schema.ts`

Dev database:

- `docker-compose.yml`
- local `.env`

## Runtime Flow

### Sign Up

1. User opens `/auth`.
2. `AuthForm` calls `authClient.signUp.email`.
3. Better Auth sends the request to `/api/auth/sign-up/email`.
4. The Next.js route delegates to the Better Auth handler.
5. Better Auth writes to PostgreSQL through the Drizzle adapter.
6. Better Auth creates a session cookie.
7. The user is redirected to `/`.

### Sign In

1. User enters email and password on `/auth`.
2. `AuthForm` calls `authClient.signIn.email`.
3. Better Auth validates credentials against the database.
4. Better Auth creates a session.
5. The home page reads the session server-side with `auth.api.getSession`.

### Sign Out

1. `SignOutButton` calls `authClient.signOut`.
2. Better Auth clears the session.
3. The home page refreshes and shows the guest state.

## Database Tables Used By Better Auth

Better Auth uses the existing auth tables:

- `user`
- `session`
- `account`
- `verification`

The Drizzle schema exports aliases with those exact names because the Better Auth Drizzle adapter expects table keys that match the auth model names.

## Runtime Configuration Notes

The server and client both explicitly set:

```text
basePath = /api/auth
```

Reason:

- The Next.js catch-all route lives at `apps/web/src/app/api/auth/[...all]/route.ts`.
- Better Auth normalizes incoming request paths by its configured auth base path.
- Keeping `basePath` explicit on both the server and browser client removes ambiguity between the public app origin and the auth API route prefix.

## Why Better Auth Here

The value is not the library name by itself.

The value is the architecture:

- Auth data stays in our PostgreSQL database.
- Drizzle keeps schema and query types close to the rest of the backend.
- Next.js owns login/session routes.
- The future NestJS game server can validate user identity through a controlled boundary instead of owning browser login.
- Authorization remains application-specific and can be enforced around wallet, table, and admin actions.

Interview framing:

```text
I used Better Auth as the authentication layer because it gives me PostgreSQL-backed sessions and a typed Drizzle integration, while still letting my application own authorization rules for wallets, realtime table actions, and admin operations.
```

## Authentication vs Authorization

Authentication:

```text
Confirm the user identity.
Example: this request belongs to user abc123.
```

Authorization:

```text
Decide what that user may do.
Example: user abc123 may bet from their own wallet but cannot adjust another user's points.
```

Current implementation covers authentication.

Next work should begin applying authorization rules to profile, wallet, and game-server flows.

## Next Recommended Auth Work

Recommended order:

1. Create `user_profiles` rows when a user signs up.
2. Create a wallet bootstrap flow for new users.
3. Add server helpers for `requireSession` and `requireUserId`.
4. Define how the NestJS game server receives trusted identity from the web app.
5. Add Socket.IO handshake validation.
6. Add role-based admin checks.

## Verification Completed

Local verification on 2026-06-05:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `GET /auth` returned `200`.
- `POST /api/auth/sign-up/email` returned `200`.
- `GET /api/auth/get-session` returned `200` with the created session.
- PostgreSQL `user` table contained the smoke-test account.
- The smoke-test account was deleted afterward.

Browser screenshot verification was not run because the Browser plugin was not exposed in this session and Playwright is not installed in the repository. The auth page and API were still verified through HTTP and database checks.

## Official Docs Used

- Better Auth Next.js integration: https://better-auth.com/docs/integrations/next
- Better Auth email/password: https://better-auth.com/docs/authentication/email-password
- Better Auth Drizzle adapter: https://better-auth.com/docs/adapters/drizzle
- Better Auth options: https://better-auth.com/docs/reference/options
