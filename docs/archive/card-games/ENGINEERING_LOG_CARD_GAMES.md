> **Dormant**: blackjack and baccarat have been switched off by default since 2026-10-01 (`CARD_GAMES_ENABLED`); see [00_INDEX.md](./00_INDEX.md) for the current state and the revival procedure.

# BK Games Engineering Log - Card Games (Archived)

These entries were moved verbatim out of the root `ENGINEERING_LOG.md` on 2026-10-01, when the lineup was narrowed to BK Derby. They keep their original wording and order, so "added" and "now" describe the state at the time each entry was written, not the default deployment today.

## Implemented Milestones

### Blackjack

- Realtime table namespace and shared socket contracts.
- Seat join, take, leave, and disconnect behavior.
- Betting timer and server-driven round start.
- Card reveal sequencing.
- Hit, stand, double, split, surrender, insurance, even money.
- US-style dealer peek behavior.
- Wallet-backed initial bets, side bets, refunds, and settlement.
- Lobby table summary API.

### Future Game Specs

- Baccarat scope, realtime table spec, and implementation plan.
- Boxing backend spec with server-authoritative broadcast model.

## Troubleshooting And Corrections

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

### Baccarat Table Background Readability Polish

Correction:

- Removed the dominant green felt/table background from the `/baccarat` table surface.
- Rebalanced the table, card zones, betting zones, squeeze panel, and roadmap panels with higher-contrast charcoal, plum, blue, rose, and gold tones for clearer scanning.
- This is frontend color polish only; no socket, betting, reveal, settlement, card identity, payout, result, or roadmap logic was changed.

### Baccarat Bet Confirmation UI

Correction:

- Changed `/baccarat` main bet zones so Player, Banker, and Tie clicks select a bet preview instead of immediately submitting `bet:place`.
- Added an explicit confirmation button that submits the selected bet through the existing socket flow, with pending feedback to avoid duplicate submissions.
- This is frontend interaction polish only; server betting validation, socket payloads, bet rules, payouts, settlement, and roadmap logic were not changed.

### Baccarat Mobile Hand Layout Polish

Correction:

- Adjusted the `/baccarat` hand area so Player and Banker panels sit side by side on mobile viewports where practical.
- The Squeeze panel now spans the next mobile row while desktop keeps the Player / Squeeze / Banker table layout.
- Tightened small-screen card, label, and count sizing to avoid overlap without changing socket, betting, reveal, settlement, card identity, payout, result, or roadmap behavior.

### Baccarat Table Metadata Cleanup

Correction:

- Removed the visible table id, state version, and updated-at timestamp chrome from the `/baccarat` status strip.
- Kept player-facing status, phase, timer, viewer count, connection, wallet, bet, reveal, and result UI intact without changing socket state or sync behavior.

### Baccarat Hand Score Display Polish

Correction:

- Replaced visible Player/Banker hand card-count badges with server-provided score badges.
- Hidden hands still show `Hidden` until the server-provided hand total is safe to display; the frontend does not calculate or infer hidden card values.
- Removed recent-round card-count copy while keeping outcome and settled score information visible.

### Baccarat Brand Palette Alignment

Correction:

- Aligned `/baccarat` route colors with the BK Games homepage/lobby palette: cream shell, ink borders, navy table surfaces, red Banker accents, gold action highlights, and ice-blue Player accents.
- Preserved Player/Banker/Tie contrast, score/hidden badges, betting confirmation, roadmaps, and mobile layout without changing game behavior.

### Baccarat Card Visual Refresh

Correction:

- Replaced `/baccarat` visible card faces with route-local JSX/SVG card rendering instead of the darker `royal-noir` image asset.
- Public cards now render clearer cream cards with large rank/suit typography, crisp suit marks, and a small BK chip detail.
- Hidden cards still render only card-back/cover visuals without rank, suit, or value access; no card identity, reveal, settlement, result, payout, or roadmap logic was changed.

### Baccarat Personal Result Feedback Polish

Correction:

- Added a prominent personal result banner to the `/baccarat` My Round panel for server-provided win, loss, push, cancelled, settled, and placed bet states.
- The banner visually separates the user's personal bet result from the overall round winner and uses only `myBet` plus `round:settled` result payload fields already emitted by the server.
- No winner, payout, settlement, card identity, reveal, roadmap, socket contract, or backend logic was changed.

### Baccarat Automatic Reveal Cadence

Correction:

- Changed Baccarat backend reveal progression so normal card reveal no longer depends on player `squeeze:progress` or `squeeze:complete` input.
- New reveal slots are server-authoritative automatic reveals with `squeezerUserId: null`, `isAutoReveal: true`, and a 1.5 second per-card cadence.
- Existing socket phase/event names are preserved for compatibility; stale client squeeze progress/complete attempts during automatic reveals are ignored and receive a fresh personal table state instead of revealing cards early.
- Hidden-card safety is preserved: rank, suit, value, hand totals, and final outcome become client-visible only after the server completes the relevant reveal path.
- Legacy/reconnect snapshots that already contain a human `squeezerUserId` still retain selected-squeezer validation and disconnect auto reveal safety.

### Baccarat Flip Reveal UI

Correction:

- Removed the player-facing squeeze progress slider and complete button from the `/baccarat` table UI.
- The web client now treats existing squeeze/reveal snapshots as server timing metadata and no longer exposes frontend methods that emit normal-play `squeeze:progress` or `squeeze:complete`.
- Added a per-card flip animation when server table state transitions a card from hidden to visible.
- Hidden cards still render only the safe card back/cover using server reveal timing; rank, suit, and value are rendered only after the server sends visible card data.
