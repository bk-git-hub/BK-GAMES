# BK Games Authentication Structure

Last updated: 2026-10-01

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

Authorization for wallet ownership, game commands, and admin operations is enforced in the service layers, not in the auth layer itself.

## Current Scope

Implemented now:

- Email/password authentication.
- Better Auth API route in the Next.js app.
- Better Auth server instance backed by PostgreSQL through Drizzle.
- Better Auth React client helper.
- Basic sign-in/sign-up page.
- Home page session display and sign-out button.
- Idempotent game account bootstrap for authenticated users.
- Automatic `user_profiles` and `wallets` creation when an authenticated user reaches the home page.
- Transaction-safe wallet mutation helper in `@bk-games/db`.
- Root `.env` loading for package-level Drizzle commands and DB client usage.
- Daily reward claim through a server action on the home page.
- Short-lived game token issued by `POST /api/game-token` and verified by the game server.
- Socket.IO client wiring on the racing screen that requests the game token and sends it in the handshake.
- Admin role check in `@bk-games/db` for the admin point adjustment route.

Not implemented yet:

- OAuth providers.
- Email verification.
- Password reset email flow.
- Initial point grant.

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

Game account bootstrap:

- `packages/db/src/user-bootstrap.ts`

Wallet transactions:

- `packages/db/src/wallet-transactions.ts`
- `packages/db/src/daily-rewards.ts`
- `WALLET_TRANSACTIONS.md`

Game token bridge:

- `apps/web/src/app/api/game-token/route.ts`
- `apps/game-server/src/auth/game-token.service.ts`
- `apps/game-server/src/auth/socket-auth.guard.ts` (provided by AuthModule; not currently applied by any gateway)
- `apps/game-server/src/racing/racing.gateway.ts`
- `apps/game-server/src/racing/racing-bets.controller.ts`

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

### Game Account Bootstrap

1. The home page reads the Better Auth session server-side.
2. If a session exists, the server calls `ensureUserGameAccount`.
3. The helper inserts a `user_profiles` row if it does not exist.
4. The helper inserts a `wallets` row if it does not exist.
5. Both inserts run inside one database transaction.
6. Unique constraints make repeated calls safe.

The browser never sends the `userId` used for bootstrap. The user id comes from the trusted server-side Better Auth session.

### Game Token For Socket.IO

1. The authenticated browser calls `POST /api/game-token`.
2. The Next.js route reads the Better Auth session server-side.
3. The route calls `ensureUserGameAccount` so profile/wallet rows exist.
4. The route signs a short-lived HS256 game token with `GAME_TOKEN_SECRET`.
5. The Socket.IO client sends the token in `handshake.auth.token`.
6. The NestJS game server verifies issuer, audience, expiration, signature, user id, nickname, and role.
7. Point-changing socket commands, such as `bet:place` on the `/racing` namespace, use the verified token identity instead of browser-supplied `userId`.

Watching a race does not require a token. `table:join` without a token joins as a guest viewer, and a guest cannot issue a ticket.

The ticket history API (`GET /racing/bets`) takes the same game token as a bearer token.

The game-server dev fallback is disabled by default. It only accepts handshake/query identity when `GAME_SOCKET_DEV_AUTH=true`.

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
- The NestJS game server validates user identity through a controlled boundary, the game token, instead of owning browser login.
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

The database package now includes the first real wallet authorization boundary for daily rewards: callers must provide a trusted server-side `userId`, and repeated claims are constrained by deterministic idempotency plus `daily_reward_claims`.

The game server now has a trusted Socket.IO identity bridge using short-lived game tokens. Socket commands should use the verified token identity, not browser payload user ids.

Ticket placement on the `/racing` namespace uses the verified socket identity and never accepts a browser-supplied user id for the wallet debit.

Daily rewards are claimed through a server action on the home page, which reads the Better Auth session server-side. Payouts and refunds are applied by the server during settlement and are never triggered by a client command.

Admin point adjustment checks the caller's `user_profiles.role` inside the same transaction as the adjustment.

## Next Recommended Auth Work

Recommended order:

1. Add a shared server helper for session reads. Server components, server actions, and route handlers currently each call `auth.api.getSession`.
2. Add email verification and a password reset email flow.
3. Add OAuth providers if they are needed.

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
