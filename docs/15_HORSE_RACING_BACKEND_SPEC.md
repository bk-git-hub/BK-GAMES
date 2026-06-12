# Horse Racing Backend Spec

This document defines the backend-facing specification for the BK Games horse racing game.

The goal is to make a race that feels close to real horse racing while staying inside BK Games' constraints:

```text
free points only
no cash
no exchange
no transfer
fictional horses only
server-authoritative simulation
auditable point ledger
live race broadcast
```

---

## 1. Product Direction

The race game should feel like a real racing broadcast, not a pre-rendered slot animation.

The first backend version uses:

```text
fictional horses
equal base stats
equal starting win probability
server-side live tick simulation
fixed odds derived from field size and payout rate
Win bet only at first
```

Important decision:

```text
The winning horse is not selected before the race starts.
The server simulates the race tick by tick.
The result is confirmed only when horses cross the finish line.
```

The server may create a deterministic random seed at race start for audit/replay, but it must not create a separate "winner" value and then force the animation to match it.

---

## 2. MVP Scope

Included:

```text
single horse racing table
6 to 8 fictional horses per race
all horses have equal base stats
race-specific temporary pace profiles
live tick broadcast
Win bet
server-authoritative finish order
wallet debit on bet
wallet payout on settlement
race history
reconnect support
```

Excluded:

```text
real horse data
real race track data
real jockey data
persistent horse advantages
Place / Exacta / Quinella / Trifecta
pari-mutuel pool payout
admin tools
frontend implementation
```

---

## 3. Core Backend Principle

The backend owns the race.

Clients may render the race, but they must not decide:

```text
horse speed
horse position
finish order
payout
race events
bet validity
```

The authoritative loop is:

```text
betting closes
race seed is created
race starts
server calculates tick N
server broadcasts tick N
server stores or can reproduce tick N
horses cross finish line
server confirms finish order
server settles bets
server emits private wallet updates
```

---

## 4. Race Lifecycle

Recommended race phases:

```text
WAITING
BETTING
LOCKING_BETS
RUNNING
FINISHING
SETTLING
SETTLED
ROUND_END
CANCELLED
```

### 4.1 WAITING

The table is idle or waiting for the next scheduled race.

### 4.2 BETTING

Users can place bets.

MVP rule:

```text
one user may place one Win bet per race
```

### 4.3 LOCKING_BETS

Short transition phase.

The server rejects new bets and prepares race state.

### 4.4 RUNNING

The server runs the online tick simulation and broadcasts race ticks.

### 4.5 FINISHING

At least one horse has crossed the finish line.

The server continues until all payout-relevant ranks are known.

For Win-only MVP, this can be very short, but still useful for visual finish ordering.

### 4.6 SETTLING

The server writes race results and wallet payouts.

### 4.7 SETTLED

The final result is visible.

### 4.8 ROUND_END

The result remains on screen before the next race.

### 4.9 CANCELLED

Race cancelled before settlement.

All accepted bets must be refunded idempotently.

---

## 5. Race Timing

Recommended MVP constants:

```text
tickIntervalMs = 100
fieldSize = 6
raceDistanceM = 1200
targetRaceDurationSec = 55 to 75
bettingDurationSec = 20
roundEndDelaySec = 8
```

The race should be live on screen.

This means the server broadcasts a tick every `tickIntervalMs` during `RUNNING`.

The client should animate between ticks, but the source of truth is the latest server tick.

---

## 6. Horse Model

MVP horses are fictional display entries.

Persistent horse records may contain:

```ts
type HorseEntry = {
  horseId: string;
  number: number;
  name: string;
  silkColor: string;
  gateNo: number;
};
```

There are no persistent performance stats in MVP.

All performance variables are temporary and sampled per race from the same distribution.

This keeps the race fair:

```text
Every horse starts with the same expected win probability.
Any advantage exists only inside one race and is sampled fairly.
```

---

## 7. Temporary Pace Profile

At race start, the server samples a temporary pace profile for each horse.

All horses use the same sampling distribution.

```ts
type RaceHorseProfile = {
  startReaction: number;
  earlyPace: number;
  midPace: number;
  turnHandling: number;
  lateKick: number;
  stamina: number;
  volatility: number;
};
```

Recommended ranges:

```text
startReaction: -1.0 to +1.0
earlyPace:     -1.0 to +1.0
midPace:       -1.0 to +1.0
turnHandling:  -1.0 to +1.0
lateKick:      -1.0 to +1.0
stamina:       -1.0 to +1.0
volatility:     0.8 to 1.2
```

These are not user-visible permanent stats.

They represent "today's run" for that race only.

---

## 8. Live Simulation State

Each horse has mutable race state.

```ts
type RaceHorseState = {
  horseId: string;
  lane: number;
  positionM: number;
  speedMps: number;
  targetSpeedMps: number;
  rank: number;
  effort: number;
  smoothNoise: number;
  currentEvent: RaceEventState | null;
  finishedAtMs: number | null;
  stateLabel:
    | "BREAK"
    | "EARLY_PUSH"
    | "CRUISING"
    | "CHASING"
    | "WIDE_TURN"
    | "LATE_SURGE"
    | "FADING"
    | "FINISHED";
};
```

The server updates these values every tick.

---

## 9. Track Progress Phases

Use normalized progress:

```text
progress = positionM / raceDistanceM
```

Recommended phases:

| Phase | Progress | Meaning |
|---|---:|---|
| BREAK | 0.00 - 0.08 | gate break and acceleration |
| EARLY | 0.08 - 0.30 | early position fight |
| MID | 0.30 - 0.65 | cruising pace |
| TURN | 0.65 - 0.82 | turn and positioning loss/gain |
| STRETCH | 0.82 - 1.00 | final straight |

These phases make the race feel natural because real races are not one continuous random sprint.

Different moments reward different temporary traits.

---

## 10. Speed Model

Do not assign a totally random speed every tick.

That creates jittery, fake movement.

Instead:

```text
calculate target speed
move current speed toward target speed
advance position
```

Formula:

```ts
targetSpeed =
  baseSpeedByPhase
  + phaseProfileBonus
  + smoothNoiseBonus
  + packModifier
  + eventModifier
  - fatiguePenalty;

speed = moveToward(
  speed,
  targetSpeed,
  accelerationLimit * dt
);

positionM += speed * dt;
```

`dt` is seconds per tick.

For `tickIntervalMs = 100`, `dt = 0.1`.

---

## 11. Base Speed By Phase

The race should accelerate, settle, then sprint.

Example baseline:

```text
BREAK:   10 to 15 m/s
EARLY:   16 to 18 m/s
MID:     15 to 17 m/s
TURN:    14 to 16 m/s
STRETCH: 16 to 19 m/s
```

These values can be tuned for desired race duration.

If the race runs too long or too short, adjust base speeds globally rather than giving one horse an unfair advantage.

---

## 12. Phase Profile Bonus

Temporary profile values matter in different phases.

```text
BREAK   uses startReaction
EARLY   uses earlyPace
MID     uses midPace and stamina
TURN    uses turnHandling
STRETCH uses lateKick and stamina
```

Example:

```ts
function getPhaseProfileBonus(profile, progress) {
  if (progress < 0.08) return profile.startReaction * 1.2;
  if (progress < 0.30) return profile.earlyPace * 0.9;
  if (progress < 0.65) return profile.midPace * 0.7;
  if (progress < 0.82) return profile.turnHandling * 0.8;
  return profile.lateKick * 1.2 + profile.stamina * 0.5;
}
```

This creates natural reversals.

Example:

```text
Horse A has strong startReaction and weak lateKick.
Horse B has weak startReaction and strong lateKick.

Horse A leads early.
Horse B closes late.
The reversal feels earned, not scripted.
```

---

## 13. Smooth Noise

Randomness must be continuous.

Bad:

```text
speed += random(-2, +2) every tick
```

Good:

```ts
smoothNoise =
  smoothNoise * 0.92
  + random(-1, 1) * 0.08 * profile.volatility;
```

Then:

```ts
smoothNoiseBonus = smoothNoise * 1.2;
```

This makes a horse gradually quicken or lose rhythm instead of twitching.

It feels natural because living motion has momentum.

---

## 14. Effort And Fatigue

Horses that overrun early should have a higher chance to fade late.

Track effort:

```ts
comfortableSpeed = 16.5;
effort += max(0, speedMps - comfortableSpeed) * dt;
```

Fatigue:

```ts
fatigueMultiplier =
  progress < 0.65 ? 0.2 :
  progress < 0.82 ? 0.6 :
  1.2;

fatiguePenalty =
  effort * 0.015 * fatigueMultiplier
  - profile.stamina * 0.3;
```

Clamp fatigue so it does not dominate the entire race.

```text
fatiguePenalty min = 0
fatiguePenalty max = 2.5 m/s
```

Why this is natural:

```text
Early leaders can get tired.
Late closers can catch them.
But an early leader can still win if its pace remains efficient.
```

---

## 15. Pack Modifier

Use a small pack modifier to prevent races from becoming visually dead too early.

It must be weak.

The goal is race rhythm, not forced rubber-banding.

Example:

```ts
if (progress > 0.25 && progress < 0.85) {
  if (rank === 1) packModifier -= 0.05;
  if (rank >= fieldSize - 1) packModifier += 0.08;
}

if (progress >= 0.85) {
  packModifier = 0;
}
```

Disable pack assist in the final stretch.

The final result should be earned by the accumulated simulation, not by last-second artificial correction.

---

## 16. Event Model

Events add race-like commentary moments.

Events must modify speed gradually and temporarily.

They must not directly set rank or winner.

Recommended MVP events:

```text
CLEAN_BREAK
SLOW_BREAK
EARLY_PUSH
SETTLE_BACK
WIDE_TURN
CLEAR_LANE
LATE_SURGE
FADE
```

Example event state:

```ts
type RaceEventState = {
  type:
    | "CLEAN_BREAK"
    | "SLOW_BREAK"
    | "EARLY_PUSH"
    | "SETTLE_BACK"
    | "WIDE_TURN"
    | "CLEAR_LANE"
    | "LATE_SURGE"
    | "FADE";
  startedAtMs: number;
  durationMs: number;
  targetPower: number;
  currentPower: number;
};
```

Event speed impact:

```ts
event.currentPower = moveToward(
  event.currentPower,
  event.targetPower,
  eventRampRate * dt
);

eventModifier = event.currentPower;
```

When an event ends, ramp `currentPower` back toward 0.

---

## 17. Event Windows

Events should only happen in believable race phases.

| Event | Allowed phase | Speed impact |
|---|---|---:|
| CLEAN_BREAK | BREAK | positive |
| SLOW_BREAK | BREAK | negative |
| EARLY_PUSH | EARLY | positive |
| SETTLE_BACK | EARLY/MID | slight negative now, less fatigue later |
| WIDE_TURN | TURN | negative |
| CLEAR_LANE | TURN/STRETCH | positive |
| LATE_SURGE | STRETCH | positive |
| FADE | STRETCH | negative |

Each horse may receive 1 to 3 events per race.

All horses use the same event probability rules.

---

## 18. Online Tick Algorithm

The race is calculated online.

The server should not preselect the winner.

Pseudo-code:

```ts
function startRace(raceId) {
  const seed = createRaceSeed(raceId);
  const rng = createDeterministicRng(seed);
  const horses = createRaceHorseStates(entries, rng);

  persistRaceStart({ raceId, seed, horses });
  scheduleNextTick(raceId);
}

function tickRace(raceId) {
  const race = loadRaceRuntimeState(raceId);
  const dt = 0.1;

  for (const horse of race.horses) {
    if (horse.finishedAtMs) continue;

    updateSmoothNoise(horse, race.rng);
    maybeStartOrUpdateEvent(horse, race, race.rng);

    const progress = horse.positionM / race.distanceM;
    const targetSpeed = calculateTargetSpeed(horse, race, progress);

    horse.speedMps = moveToward(
      horse.speedMps,
      targetSpeed,
      race.accelerationLimit * dt
    );

    horse.positionM += horse.speedMps * dt;

    if (horse.positionM >= race.distanceM) {
      horse.finishedAtMs = race.elapsedMs;
      horse.positionM = race.distanceM;
    }
  }

  updateRanks(race.horses);
  persistTickOrSnapshot(race);
  broadcastRaceTick(race);

  if (isRaceFinishedForMvp(race)) {
    finishRace(race);
    return;
  }

  scheduleNextTick(raceId);
}
```

For Win-only MVP:

```text
The race can settle after first place is confirmed.
The UI can still show remaining horses crossing if desired.
```

Recommended:

```text
Continue until all horses finish.
Then settle and show complete order.
```

---

## 19. Determinism And Audit

The race should be reproducible for backend tests and incident review.

Store:

```text
raceId
seed
field entries
temporary pace profiles
initial runtime state
tick interval
race distance
final result
settlement ledger ids
```

Recommended:

```text
persist every tick for MVP debugging, or
persist every N ticks plus deterministic RNG state
```

If storage is a concern later, store snapshots every 1 second and the final result.

---

## 20. Live Broadcast Contract

Namespace:

```text
/racing
```

Client to server:

```text
table:join
table:leave
bet:place
```

Server to client:

```text
table:state
race:tick
race:finished
race:settled
wallet:updated
error
```

Tick payload:

```ts
type RacingTickEvent = {
  tableId: string;
  raceId: string;
  tick: number;
  elapsedMs: number;
  distanceM: number;
  horses: Array<{
    horseId: string;
    number: number;
    name: string;
    lane: number;
    positionM: string;
    speedMps: string;
    rank: number;
    stateLabel:
      | "BREAK"
      | "EARLY_PUSH"
      | "CRUISING"
      | "CHASING"
      | "WIDE_TURN"
      | "LATE_SURGE"
      | "FADING"
      | "FINISHED";
    activeEvent:
      | "CLEAN_BREAK"
      | "SLOW_BREAK"
      | "EARLY_PUSH"
      | "SETTLE_BACK"
      | "WIDE_TURN"
      | "CLEAR_LANE"
      | "LATE_SURGE"
      | "FADE"
      | null;
  }>;
};
```

Use strings for point amounts and precise decimal-like values where needed.

---

## 21. Betting And Odds

MVP bet type:

```text
WIN
```

Because all horses have equal base stats, starting odds should be equal.

Example:

```text
field size = 6
fair odds = 6.0x
payout rate = 0.90
display odds = 5.4x
```

Payout:

```text
payoutAmount = floor(betAmount * displayOdds)
netAmount = payoutAmount - betAmount
```

`displayOdds` must be locked when the bet is accepted.

Do not change a user's accepted odds after betting.

---

## 22. Wallet Ledger Rules

Use existing point ledger patterns.

For racing:

```text
category = GAME
gameType = RACING
```

Ledger types:

```text
BET
PAYOUT
CANCEL_REFUND
```

Idempotency keys:

```text
racing:bet:{raceId}:{userId}:{commandId}
racing:settlement:{raceId}:{betId}
racing:cancel:{raceId}:{betId}
```

Reference:

```text
referenceType = RACING_RACE
referenceId = raceId
```

All point changes must happen in a DB transaction with:

```text
wallet row lock
balance_before
balance_after
point_ledger insert
wallet update
idempotency check
```

---

## 23. Suggested DB Tables

### racing_tables

```text
id
code
name
status
field_size
min_bet
max_bet
payout_rate_bps
betting_timeout_seconds
tick_interval_ms
race_distance_m
round_end_delay_seconds
created_at
updated_at
```

### racing_horses

```text
id
number
name
silk_color
is_active
created_at
updated_at
```

These are fictional display horses.

No real horse data.

### racing_races

```text
id
table_id
race_no
status
seed
distance_m
field_size
phase
started_at
finished_at
settled_at
cancelled_at
cancel_reason
result_order
created_at
updated_at
```

### racing_race_entries

```text
id
race_id
horse_id
number
gate_no
lane
temporary_profile
final_rank
finished_at_ms
created_at
updated_at
```

### racing_bets

```text
id
race_id
table_id
user_id
bet_type
horse_id
status
amount
odds_numerator
odds_denominator
payout_amount
net_amount
placed_ledger_id
settlement_ledger_id
command_id
created_at
settled_at
updated_at
```

### racing_ticks

For MVP debugging, store race ticks.

```text
id
race_id
tick
elapsed_ms
state
created_at
```

This can later be optimized into snapshots.

### racing_actions

```text
id
race_id
bet_id
user_id
actor_type
action_type
action_sequence
command_id
amount
payload
created_at
```

Action types:

```text
PLACE_BET
RACE_START
TICK
FINISH
SETTLE
CANCEL
```

---

## 24. Reconnect

On reconnect, the server sends:

```text
current table state
current race phase
accepted bet for the user
latest race tick
current odds board if betting is open
final result if settled
private wallet snapshot or wallet update
```

For an active race:

```text
client resumes from latest server tick
client does not simulate authority locally
```

The client may interpolate between ticks for smooth visuals.

---

## 25. Failure And Cancellation

If a race fails before settlement:

```text
mark race CANCELLED
refund all accepted bets
write CANCEL_REFUND ledgers
use idempotency key racing:cancel:{raceId}:{betId}
emit race cancelled state
```

If the server restarts during a race:

MVP recommendation:

```text
cancel active RUNNING races and refund
```

Future option:

```text
resume from persisted snapshot and deterministic RNG state
```

Do not settle a partially lost race from an incomplete client-side animation.

---

## 26. Why This Model Feels Natural

The model feels natural because it has the same visible forces users expect from racing:

```text
inertia
phase changes
pace pressure
fatigue
late acceleration
turn loss
temporary race events
```

It avoids fake motion because:

```text
speed changes smoothly
randomness is continuous
events ramp in and out
early effort affects late fatigue
final ranking comes from positions crossing the line
```

It creates reversals naturally:

```text
fast starter can lead early and fade late
late kicker can close in the stretch
wide turn can cost momentum
clear lane can create a short burst
```

No horse needs a hidden permanent advantage.

All horses start equal, but each race develops differently.

---

## 27. Backend Verification Checklist

Before merging racing backend work, verify:

```text
[ ] race winner is not preselected
[ ] race result comes from tick simulation
[ ] tick simulation runs server-side
[ ] all horses sample temporary profiles from the same distribution
[ ] accepted bets are idempotent
[ ] wallet balance is never broadcast to the table room
[ ] race ticks can be replayed or audited
[ ] reconnect receives latest authoritative race state
[ ] cancelled races refund exactly once per bet
[ ] settlement pays only after finish order is confirmed
[ ] tests cover equal starting probability distribution
[ ] tests cover finish crossing and rank ordering
[ ] tests cover idempotent bet retry
[ ] tests cover cancellation refund retry
```

---

## 28. Recommended First Backend Tasks

1. Implement pure race simulation in `packages/game-engine/src/racing`.
2. Add deterministic RNG helper scoped to racing.
3. Add unit tests for tick progression, finish ordering, and replay determinism.
4. Add DB schema for racing tables, races, entries, bets, ticks, and actions.
5. Add `placeRacingWinBet` transaction helper.
6. Add `settleRacingRace` transaction helper.
7. Add `RacingGateway` with live `race:tick` broadcast.
8. Add reconnect state recovery.
9. Add cancellation/refund path.
