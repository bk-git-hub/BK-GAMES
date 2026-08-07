# BK Games Web

Next.js frontend for BK Games.

This app owns the public home page, auth screens, playable game screens, and web-facing API routes such as Better Auth and `POST /api/game-token`.

## Current Routes

| Route | Purpose | Auth |
|---|---|---|
| `/` | Game list plus guest/login-aware reward and wallet panel | Public; login required to claim |
| `/auth` | Sign in and sign up | Public |
| `/lobby` | Legacy redirect to `/` | Public |
| `/racing/bk-derby` | BK Derby racing screen | Public; login/backend required to bet |
| `/blackjack` | Real-time Blackjack table | Required |
| `/baccarat` | Real-time Baccarat table | Required |

## Visible Game Lineup

The frontend game list currently shows:

1. BK Derby
2. Blackjack
3. Baccarat

Boxing is not part of the visible game list. The existing Boxing document is only an archived/future backend-facing specification unless the game is explicitly reactivated.

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

Authenticated or betting flows require the relevant backend pieces:

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

`NEXT_PUBLIC_GAME_SERVER_URL` should be the game-server origin only. Do not include `/blackjack`, `/baccarat`, or `/racing` in that value.
