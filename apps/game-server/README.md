# BK Games Game Server

NestJS + Socket.IO realtime runtime for BK Games.

The web app owns browser auth and UI. This service owns long-running realtime table state, Socket.IO namespaces, timers, player commands, and settlement orchestration.

## Implemented Modules

| Module | Purpose |
|---|---|
| `AuthModule` | Validate short-lived game tokens issued by `apps/web` |
| `BlackjackModule` | Blackjack namespace, table runtime, actions, settlement handoff |
| `BaccaratModule` | Baccarat namespace, betting, reveal cadence, settlement handoff |
| `RacingModule` | BK Derby racing namespace, race APIs, betting/history flows |
| `WalletModule` | Game-server access to wallet-backed DB transaction helpers |
| `HealthModule` | `GET /health` |

Boxing is not implemented in this runtime. The Boxing document is only an archived/future backend-facing specification.

## Socket Namespaces

| Game | Namespace |
|---|---|
| Blackjack | `/blackjack` |
| Baccarat | `/baccarat` |
| BK Derby | `/racing` |

## HTTP APIs

| API | Purpose |
|---|---|
| `GET /health` | Health check |
| `GET /blackjack/tables` | Blackjack table summaries |
| `GET /racing/tables` | BK Derby table summaries |
| `GET /racing/races` | Race history |
| `GET /racing/horses/stats` | Horse stats |
| `GET /racing/bets?tableId=main&limit=20` | Authenticated user ticket history |

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

DB smoke scripts live in `packages/db` and require PostgreSQL:

```bash
corepack pnpm --filter @bk-games/db smoke:blackjack-betting
corepack pnpm --filter @bk-games/db smoke:blackjack-settlement
corepack pnpm --filter @bk-games/db smoke:baccarat-betting
corepack pnpm --filter @bk-games/db smoke:baccarat-settlement
corepack pnpm --filter @bk-games/db smoke:racing-wallet
corepack pnpm --filter @bk-games/db smoke:racing-runner
```

## Environment

Typical local environment values:

```text
GAME_SERVER_HOST=localhost
GAME_SERVER_PORT=4000
GAME_TOKEN_SECRET=...
DATABASE_URL=postgres://...
WEB_ORIGIN=http://localhost:3000
```

The game token secret must match the web app's `GAME_TOKEN_SECRET`.
