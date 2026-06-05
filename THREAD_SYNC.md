# BK Games Thread Sync

This file is the handoff document for multiple Codex chat threads working on the same BK Games repository.

Every new thread should read this file first, then read `AGENTS.md`, then inspect the current git status before making changes.

Last updated: 2026-06-05

## Current Repository State

- Workspace: `C:\Users\bksoft\Documents\BK-Games`
- Branch: `main`
- Current git status at the time of this note: `THREAD_SYNC.md` and `docker-compose.yml` are uncommitted
- Latest commit: `e9e154c feat(db): add blackjack schema and migrations`
- Initial commit: `f419b8b chore: initialize bk-games monorepo`

## Project Summary

BK Games is a free-points, real-time multiplayer blackjack web game.

The project is intentionally split into multiple apps/packages:

- `apps/web`: Next.js web app for UI, auth pages, game entry, and future admin screens.
- `apps/game-server`: NestJS + Socket.IO server for realtime blackjack table runtime.
- `packages/game-engine`: Pure TypeScript blackjack rule engine.
- `packages/db`: Drizzle schema, database client, and migrations.
- `packages/shared`: Shared types, socket event names, and cross-package constants.

## Important Agent Rules

Read `AGENTS.md` before working.

The most important local rule is: report the work scope before starting every task.

The scope report should include:

- Goal
- Expected files/folders
- Main commands
- Explicitly excluded scope
- Verification method

If the scope grows, stop and report the expanded scope before continuing.

## Documentation Rules

The user explicitly separated implementation docs from interview/private notes.

Implementation source of truth:

- `docs/11_AI_AGENT_IMPLEMENTATION_DECISIONS.md`
- `docs/10_FIRST_TASKS.md`
- `docs/02_ARCHITECTURE.md`
- `docs/05_DATABASE_SCHEMA.md`
- `docs/06_POINT_WALLET.md`
- `docs/04_SOCKET_EVENTS.md`

Private user-only interview notes:

- `private/01_FULLSTACK_INTERVIEW_NOTES.md`

Rules:

- `docs/` and `private/` are gitignored.
- `private/` is not an implementation source of truth.
- Use implementation docs for build decisions.
- Use private notes only as user-facing explanation/interview context.

## Notion Project Hub

A Notion page was created for user-friendly tracking:

- Title: `BK Games 프로젝트 운영 노트`
- URL: `https://app.notion.com/p/376793efb801812cb673d8774361bed9`

It contains:

- Project structure
- Development progress
- Current process
- Key technical decisions
- Easy explanations for backend concepts
- Blackjack professional rules summary
- Docker vs direct PostgreSQL explanation

Future threads should update the Notion page when the user asks for user-facing project tracking, but should not rely on Notion as the only source of truth for implementation.

## Completed Work

### Initial Monorepo Setup

Commit: `f419b8b chore: initialize bk-games monorepo`

Implemented:

- Root pnpm workspace and Turbo setup.
- Next.js web app under `apps/web`.
- NestJS game server under `apps/game-server`.
- Shared packages under `packages/shared`, `packages/game-engine`, and `packages/db`.
- Basic health endpoint.
- Basic Socket.IO blackjack gateway stub.
- Initial shadcn/ui setup.
- Root `AGENTS.md` with project-specific agent working rules.
- `.gitignore` excluding generated files, local docs, private notes, logs, and build artifacts.

Validation at the time:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm --filter game-server test:e2e`
- Local web and health endpoint were manually verified.

### Blackjack Database Schema And Migration

Commit: `e9e154c feat(db): add blackjack schema and migrations`

Implemented:

- Drizzle schema in `packages/db/src/schema.ts`.
- DB client in `packages/db/src/client.ts`.
- Drizzle config in `packages/db/drizzle.config.ts`.
- Initial migration under `packages/db/drizzle/`.

Validation:

- `pnpm --filter @bk-games/db typecheck`
- `pnpm --filter @bk-games/db db:generate`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`

`pnpm --filter @bk-games/db db:migrate` was first blocked because no local PostgreSQL server or Docker runtime was available.

After Docker Desktop was installed, the local PostgreSQL container was started and the migration was applied successfully.

Verification:

- `docker compose ps` showed `bk-games-postgres` as `healthy`.
- `pnpm db:migrate` completed successfully.
- `information_schema.tables` showed 17 public tables.

## Confirmed Technical Decisions

### Architecture

The project uses separate frontend and game-server apps.

Decision:

- Next.js handles UI, auth-facing screens, HTTP pages/routes, and future admin UI.
- NestJS handles long-running realtime blackjack runtime.
- Socket.IO handles namespaces, table rooms, private user rooms, reconnect, and broadcast behavior.

Reason:

- Blackjack table state is long-running runtime state: seats, round phase, timers, current shoe, reconnect state, and table broadcast.
- Keeping this in a separate NestJS process is cleaner than forcing all runtime behavior into Next.js.

### Wallet And Ledger

Decision:

- `wallets` stores the current balance cache.
- `point_ledgers` stores append-only point movement history.
- Every point mutation must create a ledger row in the same transaction.

Rules:

- Do not update `wallets.balance` without a ledger entry.
- Use row locking for wallet mutation flows.
- Keep `balance_before`, `delta`, and `balance_after`.
- DB constraint enforces `balance_after = balance_before + delta`.
- Idempotency is enforced by unique keys.

### Idempotency

Decision:

- Point-changing commands must be idempotent.
- Client commands use `commandId`.
- Server-side automatic flows use deterministic idempotency keys.

Examples:

- `daily-reward:{userId}:{claimedDate}`
- `refund:{roundId}:{userId}`
- `settlement:{roundId}:{userId}`

### Private Socket Events

Decision:

- Public table state and private wallet state are separate socket event categories.

Broadcast allowed:

- Seat number
- Nickname/public player identity
- Public cards
- Bets
- Current turn
- Round results

Broadcast forbidden:

- Wallet balance
- Point ledger
- Better Auth raw user ID
- Auth token
- Admin role

Private event:

- `wallet:updated` must be emitted only to `user:{userId}` private rooms.

### Max Bet

Decision:

- Max bet is calculated and enforced on the server.
- Client-side values are display-only.

Reason:

- Browser payloads can be modified.
- Betting limits must be computed from authoritative wallet/table state.

### Blackjack Professional Rules

The schema is designed to support professional blackjack rules, including:

- Dealer stands/hits soft 17
- Blackjack payout ratios, e.g. 3:2 or 6:5
- Dealer peek
- Insurance
- Even money
- Surrender: `NONE`, `LATE`, `EARLY`
- Double down
- Double after split
- Split
- Re-split
- Re-split aces
- Hit split aces setting
- Split hand natural blackjack distinction
- Push
- Dealer blackjack settlement
- Multiple seats per user
- Per-seat and per-user betting limits
- Persistent shoe
- Shoe penetration/cut card
- Running count and true count snapshots

### Card Counting

Decision:

- Card counting is treated as an internal analytics/trainer/cheat-mode feature, not normal production player UI.

Schema support:

- `blackjack_tables.card_counting_mode`
- `blackjack_shoes.running_count`
- `blackjack_shoes.true_count_x100`
- Round before/after count snapshots

Modes:

- `DISABLED`
- `INTERNAL_ANALYTICS`
- `TRAINER_VISIBLE`

### Future Baccarat

Decision:

- `wallets` and `point_ledgers` are shared across games.
- Game-specific details should be stored in separate tables.

Expected future pattern:

- Blackjack detail tables: `blackjack_*`
- Baccarat detail tables: `baccarat_*`
- Ledger rows use `category = GAME` and `game_type = BLACKJACK | BACCARAT`.

## Current Database Schema Summary

Auth/user:

- `user`
- `session`
- `account`
- `verification`
- `user_profiles`

Wallet/ledger:

- `wallets`
- `point_ledgers`
- `daily_reward_claims`

Blackjack:

- `blackjack_tables`
- `blackjack_table_seats`
- `blackjack_shoes`
- `blackjack_rounds`
- `blackjack_round_seats`
- `blackjack_hands`
- `blackjack_side_bets`
- `blackjack_actions`

Admin:

- `admin_audit_logs`

## Current Environment Notes

As of 2026-06-05:

- Local `.env` exists and is gitignored.
- `.env.example` contains the intended local defaults.
- Docker Desktop is installed and Docker CLI is available.
- `docker compose` is available.
- `docker-compose.yml` defines the local PostgreSQL service.
- `bk-games-postgres` is running and healthy.
- `localhost:5432` accepts PostgreSQL connections through the Docker container.
- Drizzle migration has been applied to the local `bk_games` database.
- `packages/db/drizzle.config.ts` and `packages/db/src/client.ts` explicitly load the root `.env`, because filtered package commands run from `packages/db`.
- `psql`, `postgres`, and `pg_ctl` are still not installed directly on Windows, but `psql` is available inside the Postgres container through `docker exec`.

The local DB initialization step is complete.

The user chose Docker as the preferred path.

## Next Recommended Work

Next task should be Better Auth integration or wallet transaction implementation.

Recommended order:

- Wire Better Auth to the Drizzle/PostgreSQL database.
- Add session/user plumbing between `apps/web` and `apps/game-server`.
- Implement wallet creation and transaction-safe point mutation helpers.
- Implement daily reward claim as the first real wallet/ledger flow.

The local DB is now migrated, so Better Auth and wallet work can start.

## Suggested Next Scope Report

Use this before starting Better Auth setup:

```text
이번 작업 범위:
- 목표: Better Auth를 Next.js/Drizzle/PostgreSQL에 연결
- 수정 예상: apps/web, packages/db, .env.example 필요 시 보강
- 실행 명령: pnpm typecheck, pnpm lint, pnpm test, auth smoke check
- 제외: wallet transaction 구현, blackjack runtime 구현, admin UI 구현
- 검증: auth route/session 동작 확인, 타입체크/린트/테스트
```

## Update Rules For This File

Future threads should update this file when:

- A commit changes project structure.
- A major technical decision is made.
- A new external service is added.
- DB schema, auth, wallet, socket contract, or game rules change.
- The current process or next recommended task changes.

Keep updates concise and in English.

Prefer adding dated entries under `Work History` and updating `Current Repository State`, `Current Environment Notes`, and `Next Recommended Work`.

## Work History

### 2026-06-05

- User provided initial project docs from `C:\Users\bksoft\Downloads\bk-games-final-check-docs-nest\docs`.
- The implementation docs and private interview notes were separated.
- Root `AGENTS.md` was added to enforce scope reporting before every task.
- Monorepo was initialized and committed.
- Docs and private notes were gitignored by user request.
- DB schema was reviewed for blackjack professional rules, multiple seats per player, future baccarat, and shared ledger design.
- Drizzle schema and migration were implemented and committed.
- User chose Docker over direct PostgreSQL installation for local DB setup.
- Notion project hub page was created for user-friendly tracking.
- `docker-compose.yml` was added with a local `postgres` service using `postgres:17-alpine`, database `bk_games`, user `postgres`, password `postgres`, port `5432`, a named data volume, and a healthcheck.
- Docker Desktop was installed by the user.
- `docker compose up -d postgres` started `bk-games-postgres`.
- `pnpm db:migrate` applied the Drizzle migration successfully.
- The local database was verified to contain 17 public tables.
- A gitignored local `.env` file was created from `.env.example` values.
- Root `.env` loading was fixed for Drizzle CLI and the DB client.
