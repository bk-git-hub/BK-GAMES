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

### Baccarat DB Foundation

Correction:

- Added Baccarat MVP schema and migration for tables, shoes, rounds, reveal slots, bets, and actions.
- Added the `main` Baccarat table seed helper and seed script.
- This is schema/seed only: no betting transaction, settlement transaction, socket contract, game-server runtime, or web UI behavior was introduced.
- Reveal `card_snapshot` remains nullable before reveal, and shoe encrypted state/card order/server seed fields stay DB/server-only.

### Baccarat Betting Transaction

Correction:

- Added the DB-level Baccarat bet placement helper for active `WAITING_BETS` rounds.
- Bet acceptance now validates table status, betting window, MVP bet types, min/max amount, max total per user, one-main-bet-per-round, wallet balance, and command idempotency.
- Accepted bets create exactly one `BACCARAT` / `BET` point ledger and store Player, Banker, or Tie odds snapshots plus commission bps on the bet row.
- Added focused smoke coverage for success, duplicate same command, conflicting command, duplicate main bet, insufficient funds, amount bounds, closed betting window, and Baccarat odds snapshots.

### Baccarat Settlement Transaction

Correction:

- Added DB-level Baccarat round settlement and cancellation helpers.
- Settlement uses persisted bet odds and commission snapshots to handle Player wins, Banker wins, Tie wins, Player/Banker Tie pushes, and losing bets.
- Winning credits use `PAYOUT`, Tie pushes use `PUSH_REFUND`, and cancelled round refunds use `CANCEL_REFUND`.
- Added focused smoke coverage for payout amounts, Banker commission, push refunds, cancellation refunds, and idempotent settlement/cancel reruns.

### Baccarat Socket Contract

Correction:

- Added shared Baccarat realtime socket event constants and payload/view types.
- Client-visible card state now uses visible/hidden discriminated unions; hidden cards cannot carry rank, suit, or value fields.
- Added table state, betting, reveal, squeeze, wallet update, settlement, error, recent-result, and Bead Plate/basic Big Road contract types.
- This is contract-only: no game-server runtime, DB behavior, frontend UI, or wallet/settlement behavior was introduced.

### Baccarat Game Server Runtime

Correction:

- Added a NestJS Baccarat module/gateway/table runtime for `/baccarat` using the shared socket contract.
- Added server-authoritative main-table lifecycle support for betting, dealing, squeeze reveal, settlement handoff, result display, and round reset timers.
- Baccarat bet placement now calls the DB idempotency helper through `WalletService`; settlement calls the DB settlement helper and emits wallet updates only through private user rooms.
- Public table snapshots hide unrevealed cards and omit per-user `myBet`; viewer-specific state is emitted directly to that user's socket.
- Added focused game-server tests for hidden-card state, reveal safety, squeezer selection, and private `myBet` visibility.

### Baccarat Reveal Safety Hardening

Correction:

- Hardened Baccarat reveal/squeeze lifecycle checks in the game server runtime.
- Reveal activation, progress, and completion now validate round identity and active reveal status before mutating DB state.
- Active reveal progress can only be written by the selected authenticated squeezer with a current accepted round bet and an active socket connection.
- Disconnecting the final active squeezer socket now schedules a system auto reveal path so the round can continue without user intervention.
- Reconnect/table snapshots now restore revealed cards as visible, unrevealed cards as hidden placeholders, active squeeze progress/timers, and private `myBet` only for the viewer socket.
- Existing active rounds keep their original shoe; cut-card/minimum-card checks only create a new shoe before a new round starts.
- Added focused game-server coverage for non-squeezer rejection, reconnect-safe hidden-card snapshots, and disconnect auto reveal behavior.

### Baccarat Web Table UI

Correction:

- Added the authenticated `/baccarat` web route and client table experience.
- The Baccarat web client requests the existing game token, connects to the `/baccarat` Socket.IO namespace, joins/leaves the main table, and consumes table state, betting, squeeze/reveal, settlement, wallet, and error events.
- The UI renders Player/Banker/Tie betting, private `myBet`/wallet feedback, hidden placeholders for unrevealed cards, server-revealed cards, squeeze controls only for the selected squeezer, recent results, Bead Plate, and basic Big Road.
- Hidden-card safety stays client-side display-only: the frontend does not calculate card values, hand totals, outcomes, payouts, settlements, or roadmap results.
- Verification passed: `corepack pnpm --filter web typecheck`; `corepack pnpm --filter web lint`.
- Manual browser verification was skipped because the web dev server was not already available at `http://localhost:3000/baccarat`; no dev server was started or restarted by the worker.

### Baccarat Squeeze UI Polish

Correction:

- Added a progress-driven squeeze card-back visual for hidden Baccarat cards and the active squeeze panel.
- The visual only animates a safe cover/shine/edge mask while the card remains hidden; actual rank/suit card faces still render only from server-visible card payloads.
- No socket contract, game-server, DB, auth, payout, settlement, result, or roadmap logic was changed.

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

