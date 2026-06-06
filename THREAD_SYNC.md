# BK Games Thread Sync

This file is the handoff document for multiple Codex chat threads working on the same BK Games repository.

Every new thread should read this file first, then read `AGENTS.md`, then inspect the current git status before making changes.

Last updated: 2026-06-06

## Current Repository State

- Workspace: `C:\Users\bksoft\Documents\BK-Games`
- Branch: `main`
- Current git status: always run `git status --short --branch` in the active thread.
- Latest known committed baseline before Better Auth work: `e93780b chore: require commits after agent changes`
- Previous Docker setup commit: `948c0b0 chore(dev): add docker postgres setup`
- Previous DB schema commit: `e9e154c feat(db): add blackjack schema and migrations`
- Previous game token bridge commit: `1d915fd feat(auth): add game token socket bridge`
- Initial commit: `f419b8b chore: initialize bk-games monorepo`

## Project Summary

BK Games is a free-points multiplayer game platform. The first game is real-time multiplayer blackjack.

The project is intentionally split into multiple apps/packages:

- `apps/web`: Next.js web app for UI, auth pages, game entry, and future admin screens.
- `apps/game-server`: NestJS + Socket.IO server for realtime blackjack table runtime.
- `packages/game-engine`: Pure TypeScript blackjack rule engine.
- `packages/db`: Drizzle schema, database client, and migrations.
- `packages/shared`: Shared types, socket event names, and cross-package constants.

Auth structure documentation:

- `AUTH_STRUCTURE.md`

## Important Agent Rules

Read `AGENTS.md` before working.

The most important local rules are: report the work scope before starting every task, and commit after making verified file changes.

The scope report should include:

- Goal
- Expected files/folders
- Main commands
- Explicitly excluded scope
- Verification method

If the scope grows, stop and report the expanded scope before continuing.

Multi-thread coordination:

- Backend and frontend threads may run in parallel.
- Each thread must state its ownership area in the initial scope report.
- Backend-owned areas include `packages/db`, `apps/game-server`, schema/migrations, wallet/ledger/reward/settlement, socket contracts, and backend auth integration.
- Frontend-owned areas include `apps/web` UI routes, components, styling, responsive layout, frontend-only state, mock screens, and visual QA.
- Shared files such as `package.json`, `pnpm-lock.yaml`, `packages/shared`, auth route/helpers, `.env.example`, `AGENTS.md`, and `THREAD_SYNC.md` require explicit reporting before edits.
- If a shared file is changed, record the reason and impact in this file.

After making file changes:

- Inspect `git status`.
- Run the appropriate verification.
- Stage only the files that belong to the current task, using explicit pathspecs such as `git add -- AGENTS.md THREAD_SYNC.md`.
- Never use broad staging commands such as `git add .`, `git add -A`, `git add --all`, `git commit -a`, IDE/GUI Stage All, or wide wildcard staging.
- Before committing, inspect both `git diff --cached --name-only` and `git diff --cached`.
- Commit in the same task if verification passes.
- Do not include unrelated user changes, ignored local env files, logs, caches, or generated artifacts that should stay untracked.

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

### Better Auth Integration

Status: implemented and verified.

Implemented:

- Better Auth server instance in `apps/web/src/lib/auth.ts`.
- Better Auth React client helper in `apps/web/src/lib/auth-client.ts`.
- Next.js route handler in `apps/web/src/app/api/auth/[...all]/route.ts`.
- Sign-in/sign-up page under `apps/web/src/app/auth`.
- Sign-out button under `apps/web/src/components/auth`.
- Home page server-side session display.
- Drizzle schema aliases for `user`, `session`, `account`, and `verification`.
- Auth structure documentation in `AUTH_STRUCTURE.md`.
- Root pnpm override pins `kysely@0.28.17` because Better Auth `1.6.14` failed production builds with the initially resolved `kysely@0.29.2`.
- Explicit Better Auth `basePath: "/api/auth"` is configured on both the server auth instance and browser client helper.
- Local auth smoke passed: `/auth` rendered, email sign-up created a session, and the PostgreSQL `user` row was confirmed.
- User profile and wallet bootstrap now runs for authenticated users through `packages/db/src/user-bootstrap.ts`.

Current scope does not include:

- Initial point grant.
- Wallet ledger mutation service.
- Game-server socket auth.
- OAuth providers.
- Password reset email.
- Admin authorization.

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
- Wallet mutation helpers must explicitly preserve ACID behavior: atomic wallet+ledger writes, consistency checks, row-level isolation for concurrent point movement, and durable PostgreSQL commits.
- `packages/db/src/wallet-transactions.ts` implements the current `applyWalletMutation` helper.
- `WALLET_TRANSACTIONS.md` explains the helper structure and verification flow.

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
- Drizzle migrations through `0001_oval_forgotten_one.sql` have been applied to the local `bk_games` database.
- The `main` blackjack table seed has been applied with `pnpm --filter @bk-games/db seed:blackjack-main`.
- `packages/db/drizzle.config.ts` and `packages/db/src/client.ts` explicitly load the root `.env`, because filtered package commands run from `packages/db`.
- `psql`, `postgres`, and `pg_ctl` are still not installed directly on Windows, but `psql` is available inside the Postgres container through `docker exec`.

The local DB initialization step is complete.

The user chose Docker as the preferred path.

## Next Recommended Work

Next task should build on the realtime blackjack table skeleton.

Recommended order:

- Build the pure blackjack engine/state machine for dealing, player actions, dealer turn, and settlement.
- Add player action commands for hit, stand, double, split, surrender, and insurance/even-money decisions.
- Then wire frontend Socket.IO client to request game tokens, join the table, take seats, and place bets against the backend contract.

The local DB is migrated, Better Auth wiring has been verified, authenticated users are bootstrapped into `user_profiles` and `wallets`, wallet mutations now go through `applyWalletMutation`, daily rewards go through `claimDailyReward`, game-server sockets can verify short-lived game tokens from `POST /api/game-token`, and initial blackjack bets now debit wallets through an idempotent DB transaction.

## Suggested Next Scope Report

Use this before starting the next backend blackjack slice:

```text
이번 작업 범위:
- 목표: blackjack engine/state machine 기본 구현
- 수정 예상: packages/game-engine, apps/game-server, packages/shared, 필요 시 packages/db
- 실행 명령: pnpm --filter game-server test, pnpm typecheck, pnpm lint, pnpm test, pnpm build
- 제외: frontend UI, admin UI, 배포 설정
- 검증: game-engine unit test, socket command/state transition test, 전체 workspace 검증
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
- `AGENTS.md` was updated to require agents to commit after verified file changes, unless there is an explicit reason not to commit.
- `AGENTS.md` was updated with multi-thread ownership rules so backend and frontend threads can run in parallel with reduced file interference.
- `AGENTS.md` was updated to forbid broad staging commands such as `git add .`, `git add -A`, and `git commit -a`; agents must stage explicit paths and inspect staged diffs before committing.
- Better Auth integration work started: package adapter installed, auth route/client/server files added, auth UI added, and `AUTH_STRUCTURE.md` created.
- Better Auth production build issue was resolved by pinning Kysely to `0.28.17`.
- Better Auth integration was verified through `/auth`, `/api/auth/sign-up/email`, `/api/auth/get-session`, and a PostgreSQL row check; the smoke-test account was deleted afterward.
- User profile and wallet bootstrap was implemented with an idempotent DB transaction and wired into the authenticated home page flow.
- Private ACID study notes were added under `private/02_WALLET_ACID_STUDY_NOTES.md` for the user's backend learning; implementation work should still follow the wallet/ledger rules in this tracked handoff file.
- Transaction-safe wallet mutation was implemented with row locking, idempotency checks, wallet status/balance validation, ledger insertion, wallet balance/version update, and a `pnpm --filter @bk-games/db smoke:wallet` verification script.
- Frontend wording was aligned with the product direction: BK Games is a free-points multiplayer game platform, and blackjack is the first game rather than the whole project. Impact: tracked web metadata/home copy and this handoff summary now use platform framing; local gitignored implementation docs were updated the same way.
- Daily reward claim was implemented in `packages/db/src/daily-rewards.ts`, using deterministic idempotency and one DB transaction across `wallets`, `point_ledgers`, and `daily_reward_claims`.
- Shared blackjack socket contracts were added in `packages/shared`, and `apps/game-server` now has an in-memory realtime table skeleton for join, take-seat, leave-seat, disconnect, and table-state broadcasts. Impact: backend and frontend threads should use the shared event names and payload types instead of stringly typed socket events.
- The screenshot Notion upload rule was removed because uploading screenshots to Notion is not allowed. Future screenshot requests should report screenshots in chat or provide local artifact paths instead.
- Trusted game token bridge was added: `POST /api/game-token` issues short-lived HS256 tokens from the Better Auth session, and `apps/game-server` verifies Socket.IO `handshake.auth.token`. Dev query/user fallback is only allowed when `GAME_SOCKET_DEV_AUTH=true`.

### 2026-06-06

- Initial blackjack betting was added. `blackjack_tables.code` now provides stable table codes, `seed:blackjack-main` creates the `main` table, and `placeBlackjackInitialBet` records the round, round seat, initial hand, action command, BET ledger, and wallet debit in one DB transaction.
- `bet:place` now requires `commandId`, `tableId`, `seatNo`, and string point `amount`. The game-server reserves the runtime seat before DB work, confirms the bet after DB success, broadcasts table state without wallet balance, and emits `wallet:updated` only to `user:{userId}`.
- `pnpm --filter @bk-games/db smoke:blackjack-betting` verifies bet idempotency: retrying the same command reuses the same ledger and round seat without a second debit.
