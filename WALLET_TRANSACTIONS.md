# BK Games Wallet Transactions

Last updated: 2026-10-01

This document explains the current wallet mutation helper and the flows built on it.

## Goal

The wallet transaction layer answers:

```text
How do points move safely?
```

Implemented helper:

- `packages/db/src/wallet-transactions.ts`
- `packages/db/src/daily-rewards.ts`
- `packages/db/src/racing-betting.ts`
- Exported from `@bk-games/db`

## Current Scope

Implemented:

- Transaction-safe wallet balance mutation.
- PostgreSQL row lock using `select ... for update`.
- Idempotency by `userId + idempotencyKey`.
- Wallet status check.
- Balance and locked-balance safety check.
- Ledger insert and wallet update in the same DB transaction.
- Wallet version increment on successful mutation.
- Daily reward claim service using the wallet mutation helper inside the same transaction.
- Manual smoke script: `pnpm --filter @bk-games/db smoke:wallet`
- Daily reward smoke script: `pnpm --filter @bk-games/db smoke:daily-reward`
- Racing ticket placement, settlement, and cancellation refund helpers: `packages/db/src/racing-betting.ts`
- Racing wallet smoke script: `pnpm --filter @bk-games/db smoke:racing-wallet`
- Admin point adjustment helper and API route: `packages/db/src/admin.ts`, `POST /api/admin/users/[userId]/points/adjust`

Not implemented yet:

- Locked-balance hold/release helper.
- Admin point adjustment UI.

## Main API

```ts
applyWalletMutation(input);
claimDailyReward(input);
placeRacingBet(input);
settleRacingRace(input);
cancelRacingRace(input);
```

Important input fields:

- `userId`: must come from trusted server auth/session.
- `category`: `GAME`, `REWARD`, `ADMIN`, or `SYSTEM`.
- `gameType`: required only when `category = GAME`.
- `type`: ledger movement type, e.g. `DAILY_REWARD`, `BET`, `PAYOUT`.
- `delta`: point movement amount.
- `idempotencyKey`: unique command key for retry safety.
- `referenceType` and `referenceId`: what caused the movement.

Daily reward uses:

```text
category = REWARD
type = DAILY_REWARD
delta = DEFAULT_DAILY_REWARD_AMOUNT
idempotencyKey = daily-reward:{userId}:{claimDate}
referenceType = daily_reward
referenceId = daily-reward:{userId}:{claimDate}
```

Default daily reward policy:

- Amount: `1000`
- Claim date timezone: `Asia/Seoul`
- Caller may pass an explicit `claimDate` for tests or future policy control.

## Transaction Flow

```text
begin transaction
  check existing ledger by userId + idempotencyKey
  if same ledger exists, return it as idempotent

  lock wallet row with FOR UPDATE

  check existing ledger again after the lock
  if same ledger exists, return it as idempotent

  check wallet status is ACTIVE
  calculate balance_after
  reject if balance_after < 0
  reject if balance_after < locked_balance

  insert point_ledger
  update wallet balance and version
commit
```

Daily reward wraps the wallet mutation in a parent transaction:

```text
begin transaction
  apply DAILY_REWARD wallet mutation
  insert daily_reward_claims row
commit
```

This keeps `wallets`, `point_ledgers`, and `daily_reward_claims` atomic.

Racing uses the same pattern. Each flow runs in one transaction and passes that transaction to the wallet mutation helper:

```text
placeRacingBet
  lock race and table rows
  check the table is open and the ticket window is open
  lock wallet row and check stake limits against available balance
  apply BET wallet mutation
  insert racing_bets and racing_bet_selections rows

settleRacingRace
  lock race row
  write final ranks
  for each ticket: apply PAYOUT wallet mutation if it won, mark it WON or LOST
  mark race SETTLED

cancelRacingRace
  lock race row
  for each ticket: apply CANCEL_REFUND wallet mutation for the stored stake, mark it CANCELLED
  mark race CANCELLED
```

Racing idempotency keys:

```text
racing:bet:{raceId}:{userId}:{commandId}
racing:settlement:{raceId}:{betId}
racing:cancel:{raceId}:{betId}
```

Losing tickets do not create a settlement ledger row. Calling settlement or cancellation again for a finished race returns the stored result instead of moving points twice.

## Why Existing Ledger Is Checked Twice

Two identical requests can arrive at almost the same time.

The first request may insert the ledger while the second request is waiting for the wallet lock.

So the helper checks idempotency:

```text
before lock
after lock
```

This keeps retries safe and avoids double-applying the same command.

## Error Codes

The helper throws `WalletMutationError` with these codes:

- `INVALID_MUTATION`
- `WALLET_NOT_FOUND`
- `WALLET_NOT_ACTIVE`
- `INSUFFICIENT_BALANCE`
- `IDEMPOTENCY_CONFLICT`

## Delta Direction Rules

Debit types must use a negative `delta`:

- `BET`
- `DOUBLE_BET`
- `SPLIT_BET`
- `INSURANCE_BET`

Credit types must use a positive `delta`:

- `DAILY_REWARD`
- `SURRENDER_REFUND`
- `PAYOUT`
- `PUSH_REFUND`
- `CANCEL_REFUND`

`ADMIN_ADJUST` can be positive or negative, but not zero.

The racing flow uses `BET`, `PAYOUT`, and `CANCEL_REFUND`.

## Verification

Run:

```text
pnpm --filter @bk-games/db smoke:wallet
pnpm --filter @bk-games/db smoke:daily-reward
pnpm --filter @bk-games/db smoke:racing-wallet
```

The wallet smoke script creates a temporary user, profile, and wallet, then checks:

- `DAILY_REWARD +100` succeeds.
- Repeating the same reward with the same idempotency key returns the existing ledger.
- Two concurrent `BET -80` requests against a `100` balance allow only one success.
- Final balance is `20`.
- Ledger count is `2`.
- Temporary test data is deleted afterward.

Expected shape:

```json
{
  "rewardBalance": "100",
  "rewardRetryIdempotent": true,
  "debitFulfilled": 1,
  "debitRejected": 1,
  "debitRejectCodes": ["INSUFFICIENT_BALANCE"],
  "finalBalance": "20",
  "ledgerCount": 2
}
```

The daily reward smoke script checks:

- Two concurrent claims for the same date create one ledger and one claim.
- A retry for the same date returns as idempotent.
- A claim for the next date succeeds.
- Final balance is `2000`.
- Ledger count is `2`.
- Claim count is `2`.
- Temporary test data is deleted afterward.

Expected shape:

```json
{
  "sameDateIdempotentCount": 2,
  "retryIdempotent": true,
  "nextDateBalance": "2000",
  "finalBalance": "2000",
  "ledgerCount": 2,
  "claimCount": 2,
  "firstDateClaimCount": 1,
  "secondDateClaimCount": 1,
  "firstDateLedgerCount": 1
}
```

The racing wallet smoke script checks:

- A temporary user, wallet, racing table, and race can accept a ticket of every type.
- Retrying a ticket with the same `commandId` returns the same ticket and ledger without a second debit.
- Reusing a `commandId` with a different amount is rejected with `IDEMPOTENCY_CONFLICT`.
- Each ticket stores the expected multiplier numerator over a `10000` denominator.
- Settlement pays each winning ticket once, pays nothing for a losing ticket, and is idempotent when repeated.
- Cancelling a second race refunds its ticket once, and repeating the cancellation is idempotent.
- Final balance is `31070` after a `10000` grant, with `18` ledger rows.
- Temporary test data is deleted afterward.

## Next Work

Open follow-ups:

```text
locked-balance hold/release helper
admin point adjustment UI
database-level protection against UPDATE or DELETE on point_ledgers
```

Recommended boundary:

```text
Use trusted server session/user identity.
Do not accept userId from browser payload.
Keep frontend UI work in the frontend thread.
```
