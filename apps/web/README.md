# BK Derby Web

Next.js frontend for BK Derby. The workspace package is named `web` and lives in the `bk-games` repository.

This app owns the public home page, auth screens, the BK Derby race screen, and web-facing API routes such as Better Auth and `POST /api/game-token`.

## Current Routes

| Route | Purpose | Auth |
|---|---|---|
| `/` | Home page: entry to BK Derby plus a guest/login-aware daily reward and wallet panel | Public; login required to claim |
| `/auth` | Sign in and sign up | Public |
| `/lobby` | Legacy redirect to `/` | Public |
| `/racing/bk-derby` | BK Derby race screen | Public to watch; login and the game server required to issue a ticket |

## BK Derby Screen

`/racing/bk-derby` renders what the game server broadcasts:

- Live track driven by `table:state` and `table:event` on the `/racing` Socket.IO namespace
- Ticket window for the seven ticket types, with the stake limits sent by the server
- Race history, horse records, and the signed-in user's ticket history
- Wallet balance updated from private `wallet:updated` events

Guests connect without a token and can watch. A signed-in user requests a short-lived token from `POST /api/game-token` and sends it in the socket handshake. If the socket is not connected, the screen falls back to polling `GET /racing/tables` on the game server.

## Local Development

From the repository root:

```bash
corepack pnpm --filter web dev
```

Default URL:

```text
http://localhost:3000
```

Per repository rules, dev server start/stop/restart is manual.

## Validation

From the repository root:

```bash
corepack pnpm --filter web typecheck
corepack pnpm --filter web lint
corepack pnpm --filter web build
```

## Runtime Dependencies

The public home page should render without requiring the game server.

Authenticated or ticket flows require the relevant backend pieces:

- Better Auth session routes
- PostgreSQL-backed auth/wallet data
- `POST /api/game-token`
- `NEXT_PUBLIC_GAME_SERVER_URL` for Socket.IO and game-server REST calls

## Vercel Notes

The Vercel project root should be `apps/web`.

Minimum production environment variables for a working authenticated deployment:

```text
DATABASE_URL
BETTER_AUTH_SECRET
BETTER_AUTH_URL or NEXT_PUBLIC_APP_URL
GAME_TOKEN_SECRET
NEXT_PUBLIC_GAME_SERVER_URL
```

`NEXT_PUBLIC_GAME_SERVER_URL` should be the game-server origin only. Do not include `/racing` in that value.
