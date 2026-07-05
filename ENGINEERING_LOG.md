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
- Card/race/fight state
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

### Blackjack

- Realtime table namespace and shared socket contracts.
- Seat join, take, leave, and disconnect behavior.
- Betting timer and server-driven round start.
- Card reveal sequencing.
- Hit, stand, double, split, surrender, insurance, even money.
- US-style dealer peek behavior.
- Wallet-backed initial bets, side bets, refunds, and settlement.
- Lobby table summary API.

### Horse Racing

- Racing schema, seed data, and table config.
- Fixed 4-minute race cycle.
- Multiple bet types: win, place, quinella, exacta, quinella place, trio, trifecta.
- Deterministic per-tick race simulation with overtakes.
- Server `RACE_TICK` broadcast at table tick interval.
- Server `PRESTART_TICK` broadcast during the final five seconds before race start.
- 25-second server race movement window with 35-second result display.
- Today-based race history and horse statistics APIs.

### Future Game Specs

- Baccarat scope, realtime table spec, and implementation plan.
- Boxing backend spec with server-authoritative broadcast model.

## Troubleshooting And Corrections

### Shared Package Dev Runtime

Problem:

- Game-server dev runtime failed when importing shared package source files because source-watch mode expected `.js` re-export shims.

Correction:

- Added matching source shim coverage so `@bk-games/shared` can be imported in local dev/watch mode.

### Blackjack Betting Limits

Problem:

- Emitted table betting limits and backend bet validation disagreed.
- The frontend saw `100 - 6000`, but the server rejected valid minimum bets.

Correction:

- Backend validation now caps bets by actual available wallet balance instead of an incorrect derived value.

### Blackjack Timer And Dealing

Problem:

- Stale database rounds and temporary empty hands during server-driven dealing caused unexpected runtime errors.

Correction:

- Stale betting rounds are cancelled/refunded before reuse.
- Temporary empty hands serialize safely during dealing.

### Natural Blackjack Timing

Problem:

- Natural blackjack was not always settled directly when no player turn was needed.

Correction:

- No-player-turn natural blackjack rounds now move to settlement without unnecessary dealer draw steps.

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

## Current Public Status

Ready to show as portfolio material:

- Architecture and implementation docs
- AI agent workflow rules
- Auth/game token bridge explanation
- Wallet ledger documentation
- Blackjack backend and table flow
- Horse racing backend and APIs

Still worth improving:

- Production deployment plan and cost model
- Public demo environment
- Admin UI polish
- Frontend removal of any gameplay-level local replay logic in favor of server ticks
- More deterministic end-to-end scenario tests

