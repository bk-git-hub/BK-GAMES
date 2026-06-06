# BK Games Wallet Transactions

Last updated: 2026-06-06

This document explains the current wallet mutation helper.

## Goal

The wallet transaction layer answers:

```text
How do points move safely?
```

Implemented helper:

- `packages/db/src/wallet-transactions.ts`
- `packages/db/src/daily-rewards.ts`
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
- Blackjack initial bet transaction helper: `packages/db/src/blackjack-betting.ts`
- Blackjack betting smoke script: `pnpm --filter @bk-games/db smoke:blackjack-betting`

Not implemented yet:

- Blackjack double/split/insurance/surrender bet integration.
- Blackjack refund/settlement integration.
- Locked-balance hold/release helper.
- Admin point adjustment UI/API.

## Main API

```ts
applyWalletMutation(input);
claimDailyReward(input);
placeBlackjackInitialBet(input);
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

- Amount: `100`
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

## Verification

Run:

```text
pnpm --filter @bk-games/db smoke:wallet
pnpm --filter @bk-games/db smoke:daily-reward
```

The smoke script creates a temporary user, profile, and wallet, then checks:

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
- Final balance is `200`.
- Ledger count is `2`.
- Claim count is `2`.
- Temporary test data is deleted afterward.

Expected shape:

```json
{
  "sameDateIdempotentCount": 2,
  "retryIdempotent": true,
  "nextDateBalance": "200",
  "finalBalance": "200",
  "ledgerCount": 2,
  "claimCount": 2,
  "firstDateClaimCount": 1,
  "secondDateClaimCount": 1,
  "firstDateLedgerCount": 1
}
```

The blackjack betting smoke script checks:

- A temporary user, wallet, and blackjack table can place an initial bet.
- The bet creates a wallet `BET` ledger and debits the wallet once.
- Retrying the same `commandId` returns the same ledger and round seat.
- Final balance is `9500` after a `10000` grant and one `500` bet.
- Temporary test data is deleted afterward.

## Next Work

Next recommended implementation:

```text
blackjack engine/state machine and settlement
```

Recommended boundary:

```text
Use trusted server session/user identity.
Do not accept userId from browser payload.
Keep frontend UI work in the frontend thread.
```
