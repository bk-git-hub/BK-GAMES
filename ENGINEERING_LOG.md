# BK Games Engineering Log

This is the public engineering log for BK Games.

It is intentionally sanitized for portfolio use. The private thread handoff log remains local-only and is not committed.

## Project Principles

- Free-point games only: no cash, exchange, transfer, or marketplace.
- Server-authoritative game state for realtime play.
- Wallet changes must go through an append-only point ledger.
- Idempotency keys are required for retryable wallet/game commands.
- Public table state and private wallet state are separated.
- AI agents are used with explicit scope, ownership boundaries, verification, and commits.

## AI Collaboration Model

The project uses an agent rule file instead of ad-hoc prompting.

Key controls:

- Report task scope before work starts.
- Stop and report when scope expands.
- Keep backend and frontend ownership boundaries explicit.
- Stage only task-related paths; never stage all changes.
- Commit after verified file changes.
- Keep private notes out of public implementation docs.
- Keep local thread handoff logs separate from public engineering notes.

This workflow was used to coordinate backend, frontend, documentation, troubleshooting, and portfolio cleanup work across multiple AI-assisted sessions.

## Major Architecture Decisions

### Split Web And Realtime Server

BK Games uses a Next.js web app plus a separate NestJS game server.

Reasoning:

- Realtime table games need long-lived Socket.IO connections.
- Game state, timers, rooms, private wallet events, and reconnect handling are cleaner in a dedicated game server.
- The web app can focus on UI, auth-facing routes, and session ownership.

### Better Auth Plus Game Token Bridge

Better Auth owns browser login and PostgreSQL-backed sessions.

The game server does not trust browser-provided user ids. Instead:

- The authenticated browser requests a short-lived game token from the web app.
- The game server verifies the token during Socket.IO connection.
- Game commands use the verified identity from the token.

This separates authentication from game authorization and keeps wallet actions tied to trusted server-side identity.

### Ledger-Backed Wallet

Point movement is modeled as wallet balance plus ledger entries.

Important rules:

- Wallet rows are locked during mutation.
- Idempotency is checked before and after the lock.
- Debits cannot make balance negative.
- Bet, refund, payout, reward, and admin adjustment reasons are explicit ledger types.
- Game settlement and wallet mutation happen in database transactions.

### Server-Authoritative Realtime Games

Realtime games are designed so clients render state but do not decide outcomes.

Clients may animate, interpolate, and display effects. The server owns:

- Active phase
- Legal actions
- Race state
- Wallet debits and credits
- Final result
- Settlement

## Implemented Milestones

### Foundation

- Monorepo with `apps/web`, `apps/game-server`, `packages/db`, `packages/shared`, and `packages/game-engine`.
- Docker Compose PostgreSQL for local development.
- Drizzle schema and migrations.
- Better Auth session integration.
- User profile and wallet bootstrap.

### Wallet And Rewards

- Transaction-safe wallet mutation helper.
- Point ledger model.
- Daily reward claim flow.
- Idempotency conflict handling.
- Smoke tests for wallet and daily rewards.

### Horse Racing

- Racing schema, seed data, and table config.
- Fixed 4-minute race cycle.
- Multiple bet types: win, place, quinella, exacta, quinella place, trio, trifecta.
- Deterministic per-tick race simulation with overtakes.
- Server `RACE_TICK` broadcast at table tick interval.
- Server `PRESTART_TICK` broadcast during the final five seconds before race start.
- 25-second server race movement window with 35-second result display.
- Today-based race history and horse statistics APIs.

### Blackjack And Baccarat (Dormant)

- Built as realtime tables on the same wallet, ledger, and socket infrastructure as BK Derby.
- Switched off by default on 2026-10-01; the code, tests, tables, and migrations remain in the repository.
- Their milestone and troubleshooting entries moved to `docs/archive/card-games/ENGINEERING_LOG_CARD_GAMES.md`.

### Future Game Specs

- Boxing backend spec with server-authoritative broadcast model.

## Troubleshooting And Corrections

### Shared Package Dev Runtime

Problem:

- Game-server dev runtime failed when importing shared package source files because source-watch mode expected `.js` re-export shims.

Correction:

- Added matching source shim coverage so `@bk-games/shared` can be imported in local dev/watch mode.

### Racing Tick Authority

Problem:

- The racing gateway had a `RACE_TICK` event, but the emit path was tied to a 5-second lifecycle scheduler.
- That meant the event existed, but the game was not truly broadcasting live authoritative ticks at the table tick interval.

Correction:

- Added an independent race tick loop during `RUNNING`.
- The game server now emits `RACE_TICK` at the table `tickIntervalMs`.
- Main racing timing was aligned so the server source of truth matches the intended faster visual pace.

Lesson:

- A socket event name is not the same thing as a server-authoritative realtime loop.
- Completion criteria must include producer cadence, two-client synchronization, and settlement consistency.

### Racing Countdown Gap

Problem:

- The frontend countdown used `scheduledStartAt`, but the backend only started `RACE_TICK` after the 5-second lifecycle scheduler observed `RUNNING`.
- This could leave a visible gap after countdown reached zero.

Correction:

- Added a server-side `PRESTART_TICK` event for the final five seconds before `scheduledStartAt`.
- The prestart timer now advances the race to `RUNNING` immediately when remaining time reaches zero, emits `TABLE_STATE`, and starts the first `RACE_TICK` without waiting for the scheduler fallback.

### Racing Ticket History API

Problem:

- The frontend could only display tickets from local React state and the current socket session's `BET_PLACED` events.
- After leaving and re-entering the BK Derby page, the persisted user ticket history had no backend read path.

Correction:

- Added authenticated `GET /racing/bets?tableId=main&limit=20`.
- The endpoint requires a verified game token and returns only the current user's persisted racing bets, race number, table code, point amounts, status, settlement timestamp, and ordered selections.
- The API returns the existing persisted `PLACED` status for open tickets instead of inventing a new `PENDING` status.

### Orchestrator Protocol Enforcement

Problem:

- The active Codex orchestration workflow was documented in `docs/17_ORCHESTRATOR_PROTOCOL.md` and thread prompts, but not enforced by `AGENTS.md`.

Correction:

- `AGENTS.md` now references `docs/17_ORCHESTRATOR_PROTOCOL.md` for Work Orders, Gate Review, Orchestrator/Worker/Updater roles, callbacks, and Board Event ownership.
- Worker threads must not update the board directly; the Orchestrator owns Board Events to the Updater thread.
- `.orchestrator/` remains an operational board artifact and requires explicit approval before being included in public Git history.

### Dev Server Runtime Ownership (Superseded)

Problem:

- Development server start/stop/restart touches shared local resources: ports, PIDs, terminal processes, logs, browser QA, and backend health.
- Letting individual worker threads stop or kill shared dev servers can interfere with other active work.

Earlier correction, now superseded:

- `AGENTS.md` and `docs/17_ORCHESTRATOR_PROTOCOL.md` briefly defined a Runtime Manager role.
- This was replaced by the manual-operation rule below because runtime thread delegation created too much overhead.
- Runtime state and logs are local-only `.orchestrator/` artifacts unless explicitly approved for public Git.

### Dev Server Manual Operation

Problem:

- Even delegated dev server start/stop/restart adds too much orchestration overhead for the current workflow.

Correction:

- Dev server start/stop/restart is now user-operated.
- Runtime Helper is a user-owned thread. Orchestrator, Worker, and Updater threads must not send messages to it.
- Agents and worker threads may request that the user start, restart, or inspect a server, but must not start, stop, restart, kill, or message the Runtime Helper thread without explicit user instruction.
- `runtime-state` is treated as an observation record, not process ownership.

### Orchestration Default Mode Toggle

Correction:

- Updated `AGENTS.md` so orchestration is no longer forced by default.
- The default mode is now `Direct Agent Mode` with `ORCHESTRATION_MODE: off`.
- Work Order dispatch, Board Events, and worker/updater thread messages now require an explicit user request or one-off `$issue-ticket` / `$dispatch-ticket` invocation.
- The user can later re-enable or disable orchestration with explicit mode commands.

### Orchestration Rules Archived Locally

Correction:

- Removed the orchestration-specific operating sections from `AGENTS.md` so deployment-adjacent agent work follows direct repository rules only.
- Kept normal safeguards for scope reporting, shared file edits, explicit pathspec staging, commits, and manual dev server control.
- Archived the previous orchestration rule snapshot, protocol document, board/runtime artifacts, local ticket skills, and local runtime-helper skill into `private/orchestration-archive/`, which remains local-only and ignored by Git.
- Removed the active project-local orchestration skills and public orchestration protocol document from the repository tree after archiving them.

### BK Derby Demo Cadence

Correction:

- Shortened the main BK Derby table seed timing from a 4-minute cycle to a 2-minute demo-friendly cycle.
- New main timing: 30 seconds betting, 30 seconds pre-start betting lock/countdown, and 60 seconds race/result display.
- Kept race distance, 100ms tick cadence, bet types, odds, wallet, settlement, socket contract, and race simulation behavior unchanged.

### Backend Deployment Readiness

Correction:

- Updated the game-server bootstrap to support PaaS-provided `PORT` values while keeping `GAME_SERVER_PORT` as an explicit override.
- Production game-server host now defaults to `0.0.0.0`; local development still defaults to `localhost`.
- Fixed the production start script to point at the actual Nest build output, `dist/src/main.js`.
- Added `railway.json` so Railway deploys the monorepo backend with the intended game-server build/start commands and `/health` health check.
- Cleaned the example game-server URL to use the base backend URL without a Socket.IO namespace suffix.
- Added a backend deployment checklist covering required secrets, production environment variables, DB migration/seed order, build/start commands, health checks, and MVP scaling limits.

### Local Tailscale Dev Origin

Correction:

- Added the local Tailscale host to Next.js `allowedDevOrigins` so Next dev resources are not blocked when the web app is opened through the Tailscale IP.
- Expanded Better Auth trusted origins in non-production development to allow `localhost`, `127.0.0.1`, and the local Tailscale web origin.
- Kept production trusted origins constrained to configured deployment URLs.

### Agent Guide Refresh

Correction:

- Replaced the repository agent guide with a concise English version focused on the current repository map, task-specific source routing, executable validation commands, and completion criteria.
- Reclassified `docs/10_FIRST_TASKS.md` as historical setup guidance and added routing for the then-current Blackjack, Baccarat, horse racing, boxing, deployment, and Next.js PPR documentation. The Blackjack and Baccarat routes were later replaced by one archive pointer (see the 2026-10-01 entry).
- Preserved the repository's critical wallet, settlement, socket privacy, explicit Git staging, commit, and manual dev-server ownership safeguards while removing repeated templates and obsolete orchestration-era ceremony.

### Lineup Narrowed To BK Derby (2026-10-01)

Correction:

- Narrowed the product lineup to BK Derby. Blackjack and Baccarat are now switched off by default behind a single server-side switch, `CARD_GAMES_ENABLED`, which enables them only when set to exactly `true`.
- With the switch off, the game server does not load the card game modules, the data layer refuses blackjack and baccarat entry points before touching the database, and the web app answers the card game routes, admin table API, and card image assets with 404 and lists only BK Derby.
- Kept the card game source, unit tests, table definitions, and migrations so the games can be revived; wallet, ledger, settlement, socket contract, and racing behavior were not changed.
- Moved the card game specs and log entries to `docs/archive/card-games/`, with `00_INDEX.md` as the revival runbook, and tagged the last all-games commit as `archive/card-games-2026-10-01`.

## Current Public Status

Ready to show as portfolio material:

- Architecture and implementation docs
- AI agent workflow rules
- Auth/game token bridge explanation
- Wallet ledger documentation
- Horse racing backend and APIs

Still worth improving:

- Production deployment plan and cost model
- Public demo environment
- Admin UI polish
- Frontend removal of any gameplay-level local replay logic in favor of server ticks
- More deterministic end-to-end scenario tests
