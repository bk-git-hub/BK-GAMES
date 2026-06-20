# Boxing Backend Spec

This document defines the backend-facing specification for the BK Games boxing game.

The game is a fictional, server-authoritative live boxing broadcast with free-point betting.

The goal is to create a fight that feels like boxing without becoming a player-controlled fighting game or a simple health-bar arcade game.

Core constraints:

```text
free points only
no cash
no exchange
no transfer
fictional fighters only
same weight-class matching
server-authoritative simulation
auditable point ledger
live fight broadcast
no gore
```

---

## 1. Product Direction

The boxing game should feel like a live fight night broadcast.

Users do not control fighters.

Users place bets before the fight starts, then watch the fight unfold live.

Important decision:

```text
The winner is not selected before the fight starts.
The server simulates the fight exchange by exchange.
The result is confirmed only by the live fight state.
```

Seed timing:

```text
The fight seed must not exist while betting is open.
The fight seed is generated and locked only after betting closes.
The seed is generated once, persisted immediately, and never regenerated for the same fight.
```

The backend may use public fighter stats to estimate odds before betting closes, but it must not create a hidden final winner while users are still betting.

The visual style can be retro American boxing advertisement inspired, but this document only defines the game system.

---

## 2. MVP Scope

Included:

```text
single boxing table
1v1 fictional boxing matches
same weight class
3 short rounds
normal athletic fighter proportions in frontend assets
server-authoritative live fight simulation
Winner bet only
KO / TKO / Decision outcomes
wallet debit on bet
wallet payout on settlement
fight history
reconnect support
```

Excluded:

```text
real fighters
real boxing organizations
real fight records
player-controlled combat
live betting
method bets
round bets
parlay/combo bets
admin tools
frontend implementation
```

---

## 3. Core Backend Principle

The backend owns the fight.

Clients may animate the fight, but they must not decide:

```text
fighter actions
hit outcomes
damage
stamina
knockdowns
KO
TKO
judge scoring
fight result
payout
bet validity
```

The authoritative loop is:

```text
betting closes
fight seed is created
temporary fight condition is sampled
fight starts
server resolves exchange N
server broadcasts exchange/tick N
server persists state for audit/replay
fight ends by KO, TKO, or decision
server settles bets
server emits private wallet updates
```

---

## 4. Fight Lifecycle

Recommended fight phases:

```text
WAITING
BETTING
LOCKING_BETS
INTRO
ROUND_ACTIVE
ROUND_BREAK
COUNTING
REFEREE_CHECK
JUDGING
SETTLING
SETTLED
ROUND_END
CANCELLED
```

### 4.1 WAITING

The table is idle or preparing the next fight card.

### 4.2 BETTING

Users can place bets.

MVP rule:

```text
one user may place one Winner bet per fight
accepted bets cannot be cancelled
accepted bets cannot be modified
retries are allowed only with the same commandId and same bet details
```

### 4.3 LOCKING_BETS

Short transition phase.

Required behavior:

```text
close betting
reject new bet:place commands
generate and persist fight seed
sample temporary fight condition
lock accepted odds per bet
transition to INTRO
```

The seed and temporary condition are created in this phase, not during BETTING.

### 4.4 INTRO

Short visual/broadcast phase before round 1.

The server can emit fighter intro state, but no betting is allowed.

### 4.5 ROUND_ACTIVE

The server runs the live exchange simulation.

### 4.6 ROUND_BREAK

Between rounds.

The server applies limited recovery, updates corner state, and may trigger corner stoppage checks.

### 4.7 COUNTING

A fighter has been knocked down.

The server pauses normal exchanges and resolves the get-up count.

### 4.8 REFEREE_CHECK

Optional short phase after heavy punishment, a knockdown, or a guard collapse.

The server may stop the fight by TKO if stoppage conditions are met.

### 4.9 JUDGING

The fight reached the scheduled round limit.

The server calculates judge scorecards.

### 4.10 SETTLING

The server writes fight result and wallet payouts.

### 4.11 SETTLED

The final result is visible.

### 4.12 ROUND_END

The result remains on screen before the next fight.

### 4.13 CANCELLED

Fight cancelled before settlement.

All accepted bets must be refunded idempotently.

---

## 5. Fight Timing

Recommended MVP constants:

```text
tickIntervalMs = 200
exchangeIntervalMs = 700 to 1200
roundCount = 3
roundDurationSec = 45 to 60
breakDurationSec = 8 to 10
introDurationSec = 5
roundEndDelaySec = 8
bettingDurationSec = 20
```

Why use separate tick and exchange timing:

```text
tick updates let the client animate clocks, stance, movement, and HUD
exchange resolution creates meaningful boxing events
```

The backend can broadcast light ticks during idle motion and richer exchange events when punches are resolved.

---

## 6. Fighter Model

Persistent fighter records are fictional display/game entries.

They may contain public stats and style labels.

```ts
type BoxerStats = {
  power: number;
  speed: number;
  stamina: number;
  chin: number;
  defense: number;
  accuracy: number;
  aggression: number;
  composure: number;
  counter: number;
  reach: number;
};
```

Recommended stat range:

```text
0 to 100
```

Same weight-class rule:

```text
fighters must be matched inside the same weight class
overall rating should be similar
physical stat ranges should be plausible for the weight class
style and stat distribution may differ
```

Example:

```text
Fighter A: high speed, reach, defense; lower power
Fighter B: high aggression, stamina, pressure; lower defense
```

The match should not feel like equal clones, but it should stay fair.

Recommended MVP matchup band:

```text
target simulated win probability: 47% to 53%
acceptable later: 44% to 56%
avoid for MVP: any matchup wider than 40% to 60%
```

---

## 7. Weight Classes

Weight classes are balance buckets.

They are not only labels.

Example classes:

```text
Lightweight
Middleweight
Heavyweight
```

Suggested tendencies:

| Weight class | Typical feel |
|---|---|
| Lightweight | faster action, lower one-shot KO rate, more decision potential |
| Middleweight | balanced speed, power, stamina, and style diversity |
| Heavyweight | higher power/chin variance, more KO threat, slower recovery |

Same weight-class fighters should share similar total stat budgets.

Do not create hidden mismatches unless odds explicitly reflect the difference.

---

## 8. Fighting Styles

MVP styles:

```text
OUT_BOXER
PRESSURE_FIGHTER
SLUGGER
COUNTER_PUNCHER
BOXER_PUNCHER
```

Style affects tendencies, not guaranteed outcomes.

| Style | Strength | Weakness |
|---|---|---|
| OUT_BOXER | jab volume, distance, decision scoring | can be worn down by pressure |
| PRESSURE_FIGHTER | body work, stamina drain, ring control | vulnerable to counters |
| SLUGGER | power, stun, KO threat | lower efficiency and defense |
| COUNTER_PUNCHER | punish aggression, momentum swings | lower volume and possible scorecard risk |
| BOXER_PUNCHER | balanced adaptation | fewer extreme advantages |

The simulation must allow style stories without locking the winner.

Example:

```text
A pressure fighter can beat an out-boxer by draining stamina.
An out-boxer can beat a pressure fighter by clean scoring and movement.
A slugger can lose rounds but still score a late knockdown.
A counter puncher can look quiet but punish repeated aggression.
```

---

## 9. Temporary Fight Condition

After betting closes, the server samples temporary fight condition from the fight seed.

These values are per-fight only.

They are not hidden permanent fighter stats.

```ts
type FightCondition = {
  fighterA: FighterCondition;
  fighterB: FighterCondition;
  refereeStrictness: number;
  judgingVariance: number;
  paceBias: number;
};

type FighterCondition = {
  sharpness: number;
  warmup: number;
  nerves: number;
  cutResistance: number;
  recoveryTonight: number;
  volatility: number;
};
```

Recommended ranges:

```text
sharpness:       -1.0 to +1.0
warmup:          -1.0 to +1.0
nerves:          -1.0 to +1.0
cutResistance:   -1.0 to +1.0
recoveryTonight: -1.0 to +1.0
volatility:       0.8 to 1.2
```

These are used to create fight variety.

They must be sampled only after betting closes.

---

## 10. Live Fighter State

Boxers do not have HP.

Use boxing state instead:

```ts
type FighterLiveState = {
  fighterId: string;
  corner: "RED" | "BLUE";
  stamina: number;
  guard: number;
  headDamage: number;
  bodyDamage: number;
  stun: number;
  momentum: number;
  ringControl: number;
  knockdowns: number;
  knockdownsInRound: number;
  recentCleanHits: number;
  unansweredHits: number;
  currentAction: FightAction;
  currentPose: FightPose;
};
```

Recommended ranges:

```text
stamina: 0 to 100
guard: 0 to 100
headDamage: 0 to 100+
bodyDamage: 0 to 100+
stun: 0 to 100
momentum: -50 to +50
ringControl: -50 to +50
```

The frontend may display simplified values:

```text
stamina
guard
momentum
danger/stagger
knockdowns
```

Do not display gore or medical injury detail.

---

## 11. Action Set

Recommended MVP actions:

```ts
type FightAction =
  | "IDLE"
  | "RESET_DISTANCE"
  | "JAB"
  | "CROSS"
  | "HOOK"
  | "UPPERCUT"
  | "BODY_SHOT"
  | "COMBO"
  | "BLOCK"
  | "SLIP"
  | "COUNTER"
  | "CLINCH";
```

Recommended animation poses:

```ts
type FightPose =
  | "IDLE"
  | "ADVANCE"
  | "RETREAT"
  | "JAB"
  | "CROSS"
  | "HOOK"
  | "UPPERCUT"
  | "BODY_SHOT"
  | "BLOCK"
  | "SLIP"
  | "HIT_STUN"
  | "KNOCKDOWN"
  | "GET_UP"
  | "REF_STOPPAGE"
  | "VICTORY";
```

The server chooses logical actions.

The client maps actions and outcomes to animation clips.

---

## 12. Exchange Flow

Every exchange interval, the server resolves one meaningful boxing exchange.

Flow:

```text
1. determine distance and initiative
2. choose each fighter action
3. resolve hit / block / slip / counter
4. apply stamina, guard, damage, stun, and momentum
5. update round scoring data
6. check knockdown
7. check TKO/referee stoppage
8. broadcast exchange event
```

Pseudo-code:

```ts
function resolveExchange(fight) {
  const initiative = determineInitiative(fight);
  const actionA = chooseAction(fight.fighterA, fight.fighterB, initiative);
  const actionB = chooseAction(fight.fighterB, fight.fighterA, initiative);

  const outcome = resolveActionPair(actionA, actionB, fight);

  applyStaminaCosts(outcome, fight);
  applyGuardChanges(outcome, fight);
  applyDamage(outcome, fight);
  applyMomentum(outcome, fight);
  updateRoundScoring(outcome, fight);

  if (maybeKnockdown(outcome, fight)) {
    enterCountingPhase(fight);
    return;
  }

  if (maybeTko(outcome, fight)) {
    enterRefereeCheckOrStopFight(fight);
    return;
  }

  broadcastFightExchange(outcome);
}
```

---

## 13. Action Selection

Action selection should be weighted, not scripted.

Inputs:

```text
fighter style
fighter stats
live stamina
live guard
live damage
round time
score pressure
momentum
distance
opponent tendencies
temporary condition
deterministic RNG
```

Example tendencies:

```text
OUT_BOXER chooses JAB, RESET_DISTANCE, SLIP more often
PRESSURE_FIGHTER chooses BODY_SHOT, HOOK, ADVANCE pressure more often
SLUGGER chooses CROSS, HOOK, UPPERCUT more often
COUNTER_PUNCHER chooses BLOCK, SLIP, COUNTER more often
BOXER_PUNCHER balances actions based on state
```

Low stamina should reduce action quality and increase defensive errors.

Low guard should increase clean-hit risk.

High momentum should slightly improve initiative, not guarantee hits.

---

## 14. Hit Resolution

For each attack, calculate hit chance.

Example:

```ts
hitChance =
  basePunchAccuracy
  + attacker.accuracy * 0.25
  + attacker.speed * 0.10
  + attacker.reachAdvantage * 0.08
  + attacker.momentum * 0.15
  - defender.defense * 0.25
  - defender.speed * 0.08
  - defender.guard * 0.15
  - defender.composure * 0.05
  + conditionBonus
  + rngVariance;
```

Clamp:

```text
minimum hit chance = 8%
maximum hit chance = 82%
```

Outcome categories:

```text
MISS
SLIPPED
BLOCKED
PARTIAL
CLEAN
COUNTER_CLEAN
```

Recommended outcome effects:

| Outcome | Effect |
|---|---|
| MISS | attacker loses stamina, defender may gain ring control |
| SLIPPED | defender may counter, attacker loses momentum |
| BLOCKED | guard damage, low head damage |
| PARTIAL | small head/body damage, small scoring value |
| CLEAN | full damage, scoring value, stun risk |
| COUNTER_CLEAN | bonus damage, bonus stun, momentum swing |

---

## 15. Damage Philosophy

Do not use an HP bar.

Damage is pressure that affects:

```text
stun risk
knockdown risk
TKO risk
stamina recovery
judge scoring
action quality
defensive reliability
```

This makes the fight feel like boxing:

```text
a fighter can lose on points without being near KO
a fighter can be hurt badly but survive the round
a fighter can win rounds and still get knocked down by a counter
a referee can stop one-sided punishment without a full count
```

---

## 16. Punch Base Values

Suggested base values:

| Punch | Head damage | Body damage | Stamina cost | Stun risk | Scoring value |
|---|---:|---:|---:|---:|---:|
| JAB | 2-4 | 0 | low | low | medium |
| CROSS | 6-8 | 0 | medium | medium | high |
| HOOK | 7-9 | 0 | medium-high | high | high |
| UPPERCUT | 8-10 | 0 | high | high | high |
| BODY_SHOT | 1-2 | 4-6 | medium | low | medium |
| COMBO | 4-10 total | 0-5 | high | medium | high if clean |
| COUNTER | base * 1.15-1.35 | base | medium | high | high |

Jabs should score and control rhythm.

Power shots should create danger.

Body shots should matter more later than immediately.

---

## 17. Damage Calculation

Calculate raw impact first:

```ts
rawImpact =
  punchBaseDamage
  * powerScale(attacker.power)
  * hitQualityMultiplier
  * staminaPowerMultiplier(attacker.stamina)
  * momentumMultiplier(attacker.momentum)
  * styleModifier
  * randomVariance;
```

Example helpers:

```ts
powerScale = 0.75 + attacker.power / 200;
staminaPowerMultiplier = 0.65 + attacker.stamina / 285;
momentumMultiplier = 1.0 + clamp(attacker.momentum, -30, 30) / 200;
randomVariance = random(0.85, 1.15);
```

Then defender mitigation:

```ts
finalImpact =
  rawImpact
  * chinMitigation(defender.chin)
  * guardMitigation(defender.guard, outcome)
  * composureMitigation(defender.composure);
```

Example:

```ts
chinMitigation = 1.15 - defender.chin / 250;
composureMitigation = 1.08 - defender.composure / 500;
```

Guard mitigation by outcome:

```text
BLOCKED: 0.15 to 0.35 head damage, high guard damage
PARTIAL: 0.45 to 0.70 head damage, medium guard damage
CLEAN: 0.90 to 1.10 head damage, low guard mitigation
COUNTER_CLEAN: 1.10 to 1.30 head damage, bonus stun
```

Clamp final impact so a single exchange cannot create absurd results.

Recommended:

```text
normal punch max finalImpact = 14
counter/power max finalImpact = 18
combo max finalImpact = 20
```

---

## 18. Guard

Guard is a defensive state, not HP.

Guard decreases when:

```text
blocking heavy punches
taking clean shots
missing big swings
being pressured
low stamina reduces guard recovery
```

Guard recovers slowly when:

```text
fighter resets distance
fighter clinches
round break occurs
fighter is not under pressure
```

Example:

```ts
guardDamage =
  punchGuardPressure
  * hitQualityGuardMultiplier
  * (1.1 - defender.defense / 400);
```

Suggested behavior:

```text
guard above 70: clean hits are harder
guard 35 to 70: normal defensive quality
guard below 35: clean hits and stun become more likely
guard below 20: referee/TKO risk increases if punishment continues
```

---

## 19. Stamina

Stamina affects:

```text
action frequency
punch quality
defense quality
movement
get-up chance
between-round recovery
late-fight vulnerability
```

Stamina decreases from:

```text
throwing punches
missing punches
absorbing body shots
clinching under pressure
being hurt
high pace
```

Body damage should create delayed stamina pressure:

```ts
staminaRecoveryPenalty = bodyDamage * 0.05;
lateRoundStaminaDrain = bodyDamage * progressInFight * 0.015;
```

Stamina should never create impossible action by itself.

A tired fighter can still throw a dangerous power shot, but:

```text
accuracy is lower
recovery is slower
defense is worse
stun risk is higher
```

---

## 20. Stun

Stun is short-term danger.

It rises after clean power shots and counters.

It decays over time if the fighter survives and resets.

```ts
stunGain =
  finalImpact * punchStunMultiplier
  + counterBonus
  + lowGuardBonus
  + fatigueBonus
  - defender.composure * 0.04;
```

Stun decay:

```ts
stun = max(0, stun - decayPerSecond * dt);
```

Suggested:

```text
normal stun decay = 6 to 10 per second
high composure increases decay
low stamina decreases decay
```

High stun increases:

```text
knockdown chance
TKO check chance
defensive errors
unanswered hit chains
```

---

## 21. Momentum

Momentum is a short-term fight rhythm value.

It should be useful for broadcast and action weighting, but weak enough not to decide the fight alone.

Momentum increases from:

```text
clean hits
successful counters
knockdowns
ring control
winning exchanges
```

Momentum decreases from:

```text
getting hit clean
missing big punches
being backed up
getting knocked down
```

Suggested clamp:

```text
-50 to +50
```

Momentum should affect:

```text
initiative
slight action confidence
slight hit quality
UI/broadcast feel
```

Momentum must not guarantee hits or stoppages.

---

## 22. Knockdown

A knockdown check should happen only after meaningful clean impact.

Eligible outcomes:

```text
CLEAN power shot
COUNTER_CLEAN
clean combo finish
high stun follow-up
very low guard power shot
```

Example:

```ts
knockdownPressure =
  finalImpact * 1.2
  + defender.stun * 0.6
  + fatiguePenalty
  + priorKnockdownPenalty
  + attackerMomentumBonus
  + punchKnockdownBonus
  - defender.chin * 0.5
  - defender.composure * 0.3
  + rngVariance;
```

Threshold:

```text
knockdownPressure >= knockdownThreshold
```

Suggested `knockdownThreshold`:

```text
35 to 45 for MVP tuning
```

After knockdown:

```text
normal exchanges pause
round enters COUNTING
knockdowns and knockdownsInRound increment
fighter loses momentum
fighter guard drops
opponent gains scoring credit
```

---

## 23. Count And Get-Up

During COUNTING, the server resolves whether the fighter beats the count.

Do not make this purely random.

Use accumulated fight state.

```ts
getUpScore =
  defender.chin * 0.35
  + defender.composure * 0.30
  + defender.stamina * 0.20
  + defenderCondition.recoveryTonight * 8
  - defender.headDamage * 0.25
  - defender.bodyDamage * 0.08
  - defender.knockdowns * 10
  - defender.stun * 0.15
  + rngVariance;
```

If:

```text
getUpScore < getUpThreshold
```

Result:

```text
KO
```

Otherwise:

```text
fighter gets up
stun reduces but does not reset to zero
guard remains damaged
stamina decreases
round continues if time remains
```

Suggested get-up effects:

```text
stamina -= 8 to 15
guard = min(guard, 35)
stun = stun * 0.35
momentum -= 20
```

---

## 24. KO

KO means the fighter fails to beat the count after a knockdown.

KO is not the same as TKO.

KO requirements:

```text
fighter was knocked down
COUNTING phase started
get-up check failed
```

Result fields:

```text
resultType = KO
winner = opponent
endingRound = currentRound
endingTimeMs = roundElapsedMs
```

No gore or medical language is needed.

Frontend presentation:

```text
count animation
fighter stays down or cannot continue
winner celebration
result banner: KO Round 2
```

---

## 25. TKO

TKO means the fight is stopped without a failed count.

Types:

```text
TKO_REFEREE_STOPPAGE
TKO_THREE_KNOCKDOWNS
TKO_CORNER_STOPPAGE
TKO_GUARD_COLLAPSE
```

### 25.1 Referee Stoppage

Referee stoppage handles one-sided punishment.

Example:

```ts
if (
  defender.headDamage > 80 &&
  defender.guard < 25 &&
  defender.unansweredHits >= 4 &&
  defender.stun > 35
) {
  result = "TKO_REFEREE_STOPPAGE";
}
```

Use `refereeStrictness` from fight condition:

```text
strict referee = lower stoppage threshold
lenient referee = higher stoppage threshold
```

### 25.2 Three-Knockdown Rule

MVP can use a simple three-knockdown rule.

```ts
if (fighter.knockdownsInRound >= 3) {
  result = "TKO_THREE_KNOCKDOWNS";
}
```

This is easy to explain and creates broadcast drama.

### 25.3 Corner Stoppage

Between rounds, the corner may stop the fight if the fighter is too damaged and unlikely to continue safely.

Example:

```ts
if (
  betweenRounds &&
  fighter.headDamage > 90 &&
  fighter.stamina < 25 &&
  fighter.guard < 30 &&
  failedComposureCheck
) {
  result = "TKO_CORNER_STOPPAGE";
}
```

This should be rare in MVP.

### 25.4 Guard Collapse

Guard collapse is useful for non-gory stoppages.

Example:

```ts
if (
  fighter.guard <= 5 &&
  fighter.unansweredHits >= 5 &&
  fighter.stamina < 20
) {
  result = "TKO_GUARD_COLLAPSE";
}
```

Frontend presentation:

```text
referee steps between fighters
corner towel or stop gesture
fighter wobbles but no gore
result banner: TKO Round 3
```

---

## 26. Decision Scoring

If the scheduled rounds finish without KO/TKO, the fight goes to decision.

Use simplified 10-point must scoring.

Each round tracks:

```ts
type RoundScoreData = {
  cleanHits: number;
  jabsLanded: number;
  powerHits: number;
  damageDealt: number;
  bodyWork: number;
  knockdowns: number;
  ringControl: number;
  defenseSuccess: number;
  aggression: number;
};
```

Round value formula:

```ts
roundValue =
  cleanHits * 1.0
  + jabsLanded * 0.45
  + powerHits * 1.8
  + damageDealt * 0.8
  + bodyWork * 0.35
  + knockdowns * 8.0
  + ringControl * 0.5
  + defenseSuccess * 0.3
  + aggression * 0.25;
```

Knockdowns should heavily affect scoring.

Typical scoring:

```text
close normal round = 10-9
clear normal round = 10-9
dominant no-knockdown round = 10-9 or rare 10-8
one knockdown = usually 10-8
two knockdowns = 10-7 possible
three knockdowns = normally TKO in MVP
```

Suggested thresholds:

```text
value difference < 2.0 = close round
value difference 2.0 to 8.0 = clear 10-9
value difference > 8.0 without knockdown = dominant 10-9 or 10-8
one knockdown = 10-8 unless loser clearly dominated rest of round
two knockdowns = 10-7
```

---

## 27. Judges

Use three fictional judges.

Each judge has deterministic preferences sampled from the fight seed after betting closes.

```ts
type JudgeProfile = {
  cleanPunchWeight: number;
  damageWeight: number;
  aggressionWeight: number;
  ringControlWeight: number;
  defenseWeight: number;
  variance: number;
};
```

Suggested judge archetypes:

```text
Judge A favors clean punching
Judge B favors aggression and ring control
Judge C favors damage and defense
```

Judges should not be wildly random.

They should create believable close-round disagreement only.

Do:

```text
allow split decisions in close fights
allow unanimous decisions in clear fights
allow majority draw later if draw market exists
```

Avoid:

```text
randomly flipping obvious rounds
making judge variance decide every fight
creating unfair-feeling cards
```

MVP result types:

```text
DECISION_UNANIMOUS
DECISION_SPLIT
DRAW
```

---

## 28. Draw Handling

Boxing can draw.

MVP uses Winner bet only, so define draw behavior clearly.

Recommendation:

```text
if result is DRAW, Fighter A / Fighter B Winner bets are refunded as push
```

Ledger:

```text
draw push refund uses PUSH_REFUND or CANCEL_REFUND depending on existing ledger enum design
```

If the existing ledger system does not have `PUSH_REFUND`, use a game-specific refund type only after a schema decision is made.

Phase 2 can add:

```text
3-way market: Fighter A / Draw / Fighter B
```

---

## 29. Round Break Recovery

Between rounds, apply limited recovery.

```ts
stamina += baseRecovery + staminaStatBonus + recoveryTonightBonus - bodyDamagePenalty;
guard += guardRecovery + defenseBonus - headDamagePenalty;
stun *= 0.25;
unansweredHits = 0;
```

Suggested:

```text
stamina recovery = 8 to 18
guard recovery = 10 to 25
stun mostly clears
headDamage does not fully recover
bodyDamage does not fully recover
```

This creates natural late-fight changes:

```text
early body work matters later
a hurt fighter can survive to the bell
round breaks create hope without resetting the fight
```

---

## 30. Fight Result Types

Recommended enum:

```text
KO
TKO_REFEREE_STOPPAGE
TKO_THREE_KNOCKDOWNS
TKO_CORNER_STOPPAGE
TKO_GUARD_COLLAPSE
DECISION_UNANIMOUS
DECISION_SPLIT
DRAW
CANCELLED
```

For betting method markets later, group results:

```text
KO/TKO = stoppage
DECISION_UNANIMOUS / DECISION_SPLIT = decision
DRAW = draw
```

MVP only settles Winner bets.

---

## 31. Betting And Odds

MVP bet type:

```text
WINNER
```

Possible selections:

```text
FIGHTER_A
FIGHTER_B
```

Draw is a push/refund in MVP.

The bet target must be fight-specific:

```text
client selects fightEntryId or fightParticipantId
server verifies participant belongs to fightId
server settles against fight result winnerParticipantId
```

Do not settle by persistent fighter id alone.

Reason:

```text
the same fictional fighter display record may appear in many fights
fight-specific condition, corner, odds, and result belong to the fight entry
```

Odds should be stored as integer math:

```text
oddsNumerator
oddsDenominator
```

Payout:

```text
payoutAmount = floor(betAmount * oddsNumerator / oddsDenominator)
netAmount = payoutAmount - betAmount
```

Do not use floating point for settlement.

Accepted odds must be copied onto the bet row when the bet is accepted.

Do not recalculate accepted user odds later.

MVP odds options:

```text
fixed near-even odds when matchup is verified fair
or public-stat-derived odds from pre-betting simulation
```

Recommended MVP:

```text
only schedule matchups that simulate inside 47% to 53%
use simple equal-ish fixed odds
lock accepted odds per bet
```

---

## 32. Future Bet Types

Phase 2 candidates:

```text
Method of Victory: KO/TKO/Decision
Goes Distance: Yes/No
Knockdown: Yes/No
Exact Round
Fighter by KO/TKO
Fighter by Decision
Over/Under total rounds
Round winner
Draw
```

Do not add these before:

```text
simulation distribution is verified
result type frequencies are stable
integer odds are implemented
settlement audit paths are tested
```

No live betting in MVP.

Live betting requires latency-aware odds, market suspension, and more complex audit rules.

---

## 33. Wallet Ledger Rules

Use existing point ledger patterns.

For boxing:

```text
category = GAME
gameType = BOXING
```

Current implementation note:

```text
If point_ledgers.game_type does not yet allow BOXING, schema must be updated before implementation.
```

Ledger types:

```text
BET
PAYOUT
CANCEL_REFUND
PUSH_REFUND, if supported
```

If `PUSH_REFUND` is not supported, decide whether draw pushes use `CANCEL_REFUND` or require a new ledger type before implementation.

Idempotency keys:

```text
boxing:bet:{fightId}:{userId}:{commandId}
boxing:settlement:{fightId}:{betId}
boxing:cancel:{fightId}:{betId}
boxing:push:{fightId}:{betId}
```

Reference:

```text
referenceType = BOXING_FIGHT
referenceId = fightId
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

Settlement ledger creation:

```text
BET ledger is created when a bet is accepted.
PAYOUT ledger is created only for winning bets with payoutAmount > 0.
CANCEL_REFUND ledger is created only for cancelled/refunded fights.
PUSH_REFUND or chosen refund ledger is created only for draw push refunds.
Losing bets do not create an additional settlement ledger.
```

---

## 34. Suggested DB Tables

### boxing_tables

```text
id
code
name
status
min_bet
max_bet
payout_rate_bps
betting_timeout_seconds
tick_interval_ms
exchange_min_interval_ms
exchange_max_interval_ms
round_count
round_duration_seconds
break_duration_seconds
round_end_delay_seconds
created_at
updated_at
```

### boxing_fighters

```text
id
name
nickname
weight_class
style
stats
portrait_asset_key
sprite_asset_key
is_active
created_at
updated_at
```

These are fictional display/game fighters.

No real fighter data.

### boxing_fights

```text
id
table_id
fight_no
status
phase
seed
seed_locked_at
weight_class
round_count
round_duration_seconds
started_at
finished_at
settled_at
cancelled_at
cancel_reason
result_type
winner_participant_id
ending_round
ending_time_ms
scorecards
created_at
updated_at
```

Seed rule:

```text
seed must be null while the fight is in BETTING
seed is set exactly once in LOCKING_BETS after betting closes
seed_locked_at is set at the same time
seed must never be regenerated for the same fight
```

### boxing_fight_participants

```text
id
fight_id
fighter_id
corner
display_name
style
stats_snapshot
temporary_condition
final_result
knockdowns
created_at
updated_at
```

Betting should target this participant id, not the persistent fighter id.

### boxing_bets

```text
id
fight_id
table_id
user_id
bet_type
selection_participant_id
status
amount
odds_numerator
odds_denominator
payout_amount
net_amount
placed_ledger_id
settlement_ledger_id
refund_ledger_id
command_id
created_at
settled_at
updated_at
```

MVP constraints:

```text
unique fight_id + user_id
unique fight_id + user_id + command_id for idempotent bet placement
selection_participant_id must belong to the same fight_id
odds_numerator and odds_denominator are copied onto the bet row at acceptance time
accepted bet rows are not updated for user-requested cancellation or modification
settlement_ledger_id is nullable and only set for winning bets with PAYOUT
refund_ledger_id is nullable and only set for cancelled or push-refunded bets
```

### boxing_ticks

For MVP debugging and replay, store authoritative state snapshots.

```text
id
fight_id
tick
elapsed_ms
round_no
round_elapsed_ms
phase
state
created_at
```

Recommended MVP:

```text
store every 200ms tick or every authoritative exchange plus 1-second snapshots
```

If storage is acceptable, storing every tick is best for debugging.

### boxing_exchanges

Store meaningful fight events.

```text
id
fight_id
round_no
exchange_no
elapsed_ms
attacker_participant_id
defender_participant_id
attacker_action
defender_action
outcome
damage
stun_delta
guard_delta
stamina_delta
score_delta
payload
created_at
```

### boxing_actions

Audit milestones and user commands.

```text
id
fight_id
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
FIGHT_START
ROUND_START
KNOCKDOWN
KO
TKO
DECISION
SETTLE
CANCEL
```

Do not write every tick into `boxing_actions`.

Tick state belongs in `boxing_ticks`.

Meaningful combat events belong in `boxing_exchanges`.

---

## 35. Live Broadcast Contract

Namespace:

```text
/boxing
```

Client to server:

```text
table:join
table:leave
bet:place
```

`bet:place` payload:

```ts
type BoxingPlaceBetPayload = {
  commandId: string;
  tableId: string;
  fightId: string;
  betType: "WINNER";
  selectionParticipantId: string;
  amount: string;
};
```

Server must verify:

```text
fight is in BETTING
selectionParticipantId belongs to fightId
user has not already placed a bet on this fight
amount is inside min/max
wallet has sufficient balance
commandId is idempotent
```

Server to client:

```text
table:state
fight:tick
fight:exchange
fight:knockdown
fight:roundEnd
fight:result
fight:settled
wallet:updated
error
```

Tick payload:

```ts
type BoxingTickEvent = {
  tableId: string;
  fightId: string;
  phase: BoxingPhase;
  tick: number;
  elapsedMs: number;
  roundNo: number;
  roundElapsedMs: number;
  fighters: Array<{
    participantId: string;
    fighterId: string;
    corner: "RED" | "BLUE";
    name: string;
    style: string;
    stamina: number;
    guard: number;
    damageLevel: "LOW" | "MEDIUM" | "HIGH" | "DANGER";
    momentum: number;
    knockdowns: number;
    currentPose: FightPose;
  }>;
};
```

Exchange payload:

```ts
type BoxingExchangeEvent = {
  tableId: string;
  fightId: string;
  roundNo: number;
  exchangeNo: number;
  elapsedMs: number;
  attackerParticipantId: string;
  defenderParticipantId: string;
  attackerAction: FightAction;
  defenderAction: FightAction;
  outcome:
    | "MISS"
    | "SLIPPED"
    | "BLOCKED"
    | "PARTIAL"
    | "CLEAN"
    | "COUNTER_CLEAN";
  impact:
    | "NONE"
    | "LIGHT"
    | "MEDIUM"
    | "HEAVY"
    | "STAGGER";
  animationCue:
    | "JAB"
    | "CROSS"
    | "HOOK"
    | "UPPERCUT"
    | "BODY_SHOT"
    | "BLOCK"
    | "SLIP"
    | "COUNTER"
    | "HIT_STUN"
    | "CLINCH";
  commentaryKey: string;
};
```

Do not broadcast wallet balances to the public table room.

Wallet updates are private user events only.

---

## 36. Reconnect

On reconnect, the server sends a full current fight snapshot.

```text
current table state
current fight phase
accepted bet for the user
latest authoritative tick
current round and clock
both fighter states
latest exchange summary
current score hints if allowed
final result if settled
private wallet snapshot or wallet update
```

For an active fight:

```text
client resumes from latest server tick
client does not simulate authority locally
client may interpolate visual animation between authoritative ticks
```

The reconnect response should not require the client to replay recent tick history to recover.

---

## 37. Failure And Cancellation

If a fight fails before settlement:

```text
mark fight CANCELLED
refund all accepted bets
write refund ledgers
use idempotency key boxing:cancel:{fightId}:{betId}
emit fight cancelled state
```

If the server restarts during a fight:

MVP recommendation:

```text
cancel active non-settled fights and refund
```

This is a required tested path.

The restart recovery job must:

```text
find non-settled active fights
mark them CANCELLED
refund each accepted bet exactly once
write refund ledgers
record cancellation reason
be safe to run multiple times
```

Future option:

```text
resume from persisted tick/exchange snapshot and deterministic RNG state
```

Do not settle a partially lost fight from incomplete client-side animation.

---

## 38. Determinism And Audit

The fight should be reproducible for backend tests and incident review.

Store:

```text
fightId
seed
fight participants
stats snapshots
temporary fight condition
judge profiles
tick interval
exchange timing
round settings
exchange log
final result
scorecards
settlement ledger ids
```

The simulation can use deterministic RNG after seed creation.

All randomness after betting closes should derive from the locked fight seed.

---

## 39. Distribution Testing

Before using a matchup template in production, run simulation distribution tests.

Required:

```text
run at least 10,000 fights per matchup template
measure Fighter A win rate
measure Fighter B win rate
measure draw rate
measure KO/TKO/Decision distribution
measure average fight duration
measure knockdowns per fight
measure scorecard disagreement rate
```

MVP acceptance:

```text
Winner matchup is inside target fairness band
KO/TKO rate is not absurdly high
draw rate is low enough for Winner bet push handling
decision scoring does not produce random-feeling results
same corner does not create persistent bias
same style does not dominate all matchups
```

Suggested initial targets:

```text
KO/TKO combined: 20% to 45%
Decision: 55% to 80%
Draw: 0% to 5%
Average fight length: 2 to 3 rounds for MVP timing
```

These are product tuning targets, not boxing realism requirements.

---

## 40. Why This Model Feels Natural

This model feels natural because it uses boxing pressure instead of HP.

Visible fight stories emerge from:

```text
stamina loss
guard damage
head damage
body damage
stun
momentum
round scoring
knockdowns
referee stoppages
judge preferences
```

Examples:

```text
Out-boxer wins early with jabs and distance.
Pressure fighter drains stamina with body shots.
Slugger loses rounds but lands a knockdown.
Counter puncher punishes reckless aggression.
Tired fighter's guard collapses late.
Close fight creates split decision tension.
One-sided punishment ends by TKO without gore.
```

Most importantly:

```text
KO, TKO, and Decision come from different state pressure.
The winner is not a preselected animation outcome.
```

---

## 41. Backend Verification Checklist

Before merging boxing backend work, verify:

```text
[ ] fight winner is not preselected
[ ] fight seed is generated only after betting closes
[ ] fight seed is persisted once and never regenerated
[ ] fight result comes from server simulation
[ ] simulation runs server-side
[ ] same weight-class matching is enforced
[ ] matchup distribution test runs 10,000+ simulations
[ ] accepted bets are idempotent
[ ] bet target is fight participant id, not persistent fighter id alone
[ ] bet placement verifies participant belongs to fight
[ ] accepted bets cannot be cancelled or modified in MVP
[ ] accepted odds are stored as odds_numerator and odds_denominator
[ ] settlement uses integer payout math only
[ ] draw/push behavior is explicitly implemented
[ ] losing bets do not create PAYOUT ledgers
[ ] wallet balance is never broadcast to the table room
[ ] KO requires failed get-up after knockdown
[ ] TKO does not require failed count
[ ] decision uses round score data
[ ] judges are deterministic from seed
[ ] reconnect receives a full current fight snapshot
[ ] cancelled fights refund exactly once per bet
[ ] server restart cancellation/refund path is tested
[ ] tests cover knockdown/get-up
[ ] tests cover TKO thresholds
[ ] tests cover decision scoring
[ ] tests cover split decision/draw handling if enabled
[ ] tests cover idempotent bet retry
[ ] tests cover idempotency conflict on changed retry details
[ ] tests cover cancellation refund retry
```

---

## 42. Recommended First Backend Tasks

1. Implement pure fight simulation in `packages/game-engine/src/boxing`.
2. Add deterministic RNG helper scoped to boxing.
3. Add fighter style/action selection tests.
4. Add damage, stun, guard, stamina, knockdown, and get-up unit tests.
5. Add TKO condition unit tests.
6. Add decision scoring and judge profile tests.
7. Add 10,000+ fight distribution tests for each MVP matchup template.
8. Add DB schema for boxing tables, fights, participants, bets, ticks, exchanges, and actions.
9. Add `BOXING` to point ledger game type if not already supported.
10. Add `placeBoxingWinnerBet` transaction helper with no cancellation/modification path.
11. Add `settleBoxingFight` transaction helper using integer odds math.
12. Add draw push/refund handling.
13. Add server restart cancellation/refund recovery.
14. Add `BoxingGateway` with live tick and exchange broadcast.
15. Add reconnect full-snapshot state recovery.
