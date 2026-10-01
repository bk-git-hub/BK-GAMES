# BK Derby Game Server

NestJS + Socket.IO realtime runtime for BK Derby. The workspace package is named `game-server` and lives in the `bk-games` repository.

The web app owns browser auth and UI. This service owns the long-running race state, the `/racing` Socket.IO namespace, phase timers, the tick broadcast, ticket commands, and settlement orchestration.

## Modules Used By BK Derby

| Module | Purpose |
|---|---|
| `AuthModule` | Validate short-lived game tokens issued by `apps/web` |
| `RacingModule` | BK Derby racing namespace, race lifecycle timers, race APIs, ticket and history flows |
| `WalletModule` | Game-server access to wallet-backed DB transaction helpers |
| `HealthModule` | `GET /health` |

## Socket Namespace

| Game | Namespace |
|---|---|
| BK Derby | `/racing` |

| Direction | Event | Purpose |
|---|---|---|
| Client to server | `table:join` | Join the table room; guests may join without a token |
| Client to server | `bet:place` | Issue a ticket; requires a game token and a `commandId` |
| Server to client | `table:state` | Full table snapshot with a `version` counter |
| Server to client | `table:event` | Event stream: race scheduled, ticket placed, pre-start tick, race started, race tick, race settled |
| Server to client | `wallet:updated` | Private balance update, sent only to the affected user's room |
| Server to client | `error` | Error code and message |

## Race Lifecycle

- The table config and the current race are read from PostgreSQL through `@bk-games/db`. The server keeps an in-memory runtime copy per table, and the gateway advances it with timers.
- Timers cover the ticket window opening and closing, the pre-start countdown, the race tick loop, and the round end. They run only while the table has viewers or live tickets; otherwise the race clock is paused.
- During a race, `racing-race-tick.ts` computes each entry's progress and rank from the elapsed server time on every tick interval.
- When the last entry finishes, the gateway asks `@bk-games/db` to advance the lifecycle. The final order comes from the race simulation in `@bk-games/shared`, and settlement runs in one database transaction.
- A schedule sync runs every 60 seconds as a backstop for missed timers.

## HTTP APIs

| API | Purpose |
|---|---|
| `GET /health` | Health check |
| `GET /racing/tables` | BK Derby table summaries |
| `GET /racing/races` | Race history; optional `tableId`, `date` (`YYYY-MM-DD`, Korea time), `limit` |
| `GET /racing/horses/stats` | Horse stats; same query options as race history |
| `GET /racing/bets?tableId=main&limit=20` | Authenticated user ticket history; requires `Authorization: Bearer <game token>` |

## Local Development

From the repository root:

```bash
corepack pnpm --filter game-server dev
```

Default local URL:

```text
http://localhost:4000
```

Health check:

```text
http://localhost:4000/health
```

Per repository rules, dev server start/stop/restart is manual.

## Validation

From the repository root:

```bash
corepack pnpm --filter game-server typecheck
corepack pnpm --filter game-server lint
corepack pnpm --filter game-server test
corepack pnpm --filter game-server smoke:racing-cycle
```

`smoke:racing-cycle` needs PostgreSQL and a running game server. It places one ticket and follows the race through settlement. It sends no game token, so the target server must be started with `GAME_SOCKET_DEV_AUTH=true` and use the same `DATABASE_URL` as the script. It is for local development only.

DB smoke scripts live in `packages/db` and require PostgreSQL:

```bash
corepack pnpm --filter @bk-games/db smoke:wallet
corepack pnpm --filter @bk-games/db smoke:daily-reward
corepack pnpm --filter @bk-games/db smoke:racing-wallet
corepack pnpm --filter @bk-games/db smoke:racing-scheduler
corepack pnpm --filter @bk-games/db smoke:racing-runner
```

## Environment

Typical local environment values:

```text
GAME_SERVER_HOST=localhost
GAME_SERVER_PORT=4000
GAME_TOKEN_SECRET=...
DATABASE_URL=postgres://...
GAME_SERVER_CORS_ORIGINS=http://localhost:3000
```

The game token secret must match the web app's `GAME_TOKEN_SECRET`.

The server reads the repository-root `.env` first and then `apps/game-server/.env`.

- Port: `GAME_SERVER_PORT`, then `PORT`, then `4000`.
- Host: `GAME_SERVER_HOST`; without it, `0.0.0.0` when `NODE_ENV=production` and `localhost` otherwise.
- CORS: `http://localhost:3000` and `http://127.0.0.1:3000` are always allowed. Add origins as comma-separated values in `GAME_SERVER_CORS_ORIGINS` or `CORS_ORIGINS`; the origin in `NEXT_PUBLIC_APP_URL` is also allowed. Outside production, `http` origins on port 3000 from loopback and private-network addresses are allowed unless `GAME_SERVER_ALLOW_NETWORK_DEV_ORIGINS=false`.
- `GAME_SOCKET_DEV_AUTH=true` lets commands fall back to handshake-supplied identity when no token is sent. Leave it unset outside local development. `smoke:racing-cycle` relies on this fallback.
