# BK Games

BK Games is a portfolio project for a realtime free-point game platform.

The project focuses on multiplayer game infrastructure rather than cash gambling:

- No cash deposits
- No point exchange
- No point transfer
- No marketplace
- Server-authoritative game state
- Ledger-backed point wallet

## Highlights

- Realtime Blackjack table with seats, betting windows, split, double, surrender, insurance, even money, dealer peek, private wallet updates, and settlement/reset flow.
- Server-authoritative horse racing with fixed race slots, Socket.IO tick broadcasts, deterministic race simulation, multiple bet types, wallet-backed payouts, and today-based result/stat APIs.
- Point wallet ledger with idempotency keys, row-level locking, balance safety checks, and transaction-safe settlement.
- Better Auth session flow bridged into the NestJS game server through short-lived game tokens.
- AI-assisted development workflow documented through agent rules, scoped commits, cross-thread handoff, troubleshooting notes, and public engineering logs.

## Tech Stack

| Area | Stack |
|---|---|
| Web | Next.js, React, TypeScript |
| Realtime server | NestJS, Socket.IO |
| Database | PostgreSQL, Drizzle ORM |
| Auth | Better Auth, server-issued game tokens |
| Monorepo | pnpm workspaces, Turbo |
| Local infra | Docker Compose PostgreSQL |
| Quality gates | TypeScript typecheck, Jest, smoke scripts |

## Architecture

```text
apps/web
  Next.js UI, auth-facing routes, lobby, game pages

apps/game-server
  NestJS HTTP + Socket.IO namespaces for realtime games

packages/db
  Drizzle schema, wallet ledger helpers, game settlement helpers, seed/smoke scripts

packages/shared
  Shared socket contracts and API response types

packages/game-engine
  Pure game-domain helpers
```

The web app owns browser sessions. The game server does not trust browser-supplied user ids; it verifies short-lived game tokens issued by the web app from the authenticated session.

## Implemented Game Systems

### Blackjack

- Realtime table state over Socket.IO
- Seat occupancy and leave/disconnect handling
- Betting timer and round start flow
- Server-driven card reveal events
- Split, double, surrender, insurance, even money
- US-style dealer peek
- Wallet-backed bets, refunds, side bets, and payouts
- Private `wallet:updated` events scoped to user rooms

### Horse Racing

- Fixed 4-minute race cycle
- Betting, lock, running, settlement, result display phases
- Server-authoritative `RACE_TICK` broadcast at table tick interval
- 25-second race movement window inside a 60-second race/result phase
- Win, place, quinella, exacta, quinella place, trio, trifecta bet types
- Deterministic race simulation with visible overtakes
- Today-based race history and horse stats APIs

### Planned / Specified

- Baccarat realtime table
- Boxing broadcast game
- Admin UI polish
- Production deployment hardening

## AI-Assisted Engineering Workflow

This repository intentionally includes the AI collaboration rules used during development.

- [AGENTS.md](./AGENTS.md) defines agent working rules: scope reporting, small task boundaries, explicit path staging, commit discipline, backend/frontend ownership, and local handoff rules.
- [ENGINEERING_LOG.md](./ENGINEERING_LOG.md) is the public, sanitized engineering log that summarizes milestones, decisions, and troubleshooting outcomes.

The goal was not to hide AI usage. The goal was to treat AI agents like disciplined collaborators with clear boundaries, reviewable commits, and documented architectural decisions.

## Documentation

| Document | Purpose |
|---|---|
| [AUTH_STRUCTURE.md](./AUTH_STRUCTURE.md) | Auth/session/game-token architecture |
| [WALLET_TRANSACTIONS.md](./WALLET_TRANSACTIONS.md) | Wallet ledger, idempotency, and lock strategy |
| [docs/00_README.md](./docs/00_README.md) | Original implementation document index |
| [docs/12_BACCARAT_SCOPE.md](./docs/12_BACCARAT_SCOPE.md) | Baccarat scope |
| [docs/13_BACCARAT_REALTIME_TABLE_SPEC.md](./docs/13_BACCARAT_REALTIME_TABLE_SPEC.md) | Baccarat realtime table spec |
| [docs/14_BACCARAT_IMPLEMENTATION_PLAN.md](./docs/14_BACCARAT_IMPLEMENTATION_PLAN.md) | Baccarat implementation plan |
| [docs/15_HORSE_RACING_BACKEND_SPEC.md](./docs/15_HORSE_RACING_BACKEND_SPEC.md) | Horse racing backend spec |
| [docs/16_BOXING_BACKEND_SPEC.md](./docs/16_BOXING_BACKEND_SPEC.md) | Boxing backend spec |

## Local Development

```bash
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm --filter @bk-games/db seed:blackjack-main
pnpm --filter @bk-games/db seed:racing-main
pnpm dev
```

Useful checks:

```bash
pnpm typecheck
pnpm --filter game-server test
pnpm --filter @bk-games/db smoke:racing-runner
pnpm --filter @bk-games/db smoke:racing-wallet
```

## Portfolio Framing

BK Games is meant to demonstrate:

- Full-stack architecture across web, realtime server, shared contracts, and database packages.
- Backend reasoning around transactions, idempotency, ledgers, and authorization boundaries.
- Realtime game design with server-authoritative state instead of client-trusted outcomes.
- Practical AI-agent orchestration through documented scope control, commit hygiene, and troubleshooting.

