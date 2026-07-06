import { eq, sql } from "drizzle-orm";

import { db } from "./client.js";
import {
  baccaratActions,
  baccaratBets,
  baccaratRounds,
  type CardSnapshot,
  type JsonObject,
} from "./schema.js";
import {
  applyWalletMutationInTransaction,
  type WalletMutationResult,
  type WalletMutationTransaction,
} from "./wallet-transactions.js";

export type BaccaratRoundOutcome = "PLAYER" | "BANKER" | "TIE";
export type BaccaratBetSettlementOutcome = "WIN" | "LOSE" | "PUSH";

const baccaratRoundOutcomes = new Set<BaccaratRoundOutcome>([
  "PLAYER",
  "BANKER",
  "TIE",
]);
const zero = BigInt(0);

export type BaccaratSettlementErrorCode =
  | "ROUND_NOT_FOUND"
  | "INVALID_SETTLEMENT"
  | "SETTLEMENT_CONFLICT"
  | "INVALID_CANCEL";

export class BaccaratSettlementError extends Error {
  readonly code: BaccaratSettlementErrorCode;

  constructor(code: BaccaratSettlementErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "BaccaratSettlementError";
  }
}

export type SettleBaccaratRoundInput = {
  roundId: string;
  outcome: BaccaratRoundOutcome;
  playerTotal?: number | null;
  bankerTotal?: number | null;
  isNatural?: boolean;
  totalCards?: number | null;
  playerCards?: CardSnapshot[];
  bankerCards?: CardSnapshot[];
  resultFlags?: JsonObject;
  roadmapSnapshot?: JsonObject | null;
};

export type SettleBaccaratRoundResult = {
  roundId: string;
  outcome: BaccaratRoundOutcome;
  bets: SettleBaccaratBetResult[];
};

export type SettleBaccaratBetResult = {
  betId: string;
  userId: string;
  betType: BaccaratRoundOutcome;
  outcome: BaccaratBetSettlementOutcome;
  payoutAmount: bigint;
  netAmount: bigint;
  walletMutation: WalletMutationResult | null;
  ledgerType: "PAYOUT" | "PUSH_REFUND" | null;
};

export type CancelBaccaratRoundInput = {
  roundId: string;
  reason: string;
};

export type CancelBaccaratRoundResult = {
  roundId: string;
  bets: CancelBaccaratBetResult[];
};

export type CancelBaccaratBetResult = {
  betId: string;
  userId: string;
  betType: BaccaratRoundOutcome;
  refundAmount: bigint;
  walletMutation: WalletMutationResult;
  ledgerType: "CANCEL_REFUND";
};

type LockedBaccaratRound = {
  id: string;
  tableId: string;
  shoeId: string;
  roundNo: number;
  status: string;
  outcome: string | null;
  playerTotal: number | null;
  bankerTotal: number | null;
  isNatural: boolean;
  totalCards: number | null;
  cancelReason: string | null;
};

type BaccaratBetSettlementPlan = {
  outcome: BaccaratBetSettlementOutcome;
  payoutAmount: bigint;
  netAmount: bigint;
  ledgerType: "PAYOUT" | "PUSH_REFUND" | null;
};

export async function settleBaccaratRound(
  input: SettleBaccaratRoundInput,
): Promise<SettleBaccaratRoundResult> {
  const normalizedInput = normalizeSettleBaccaratRoundInput(input);

  return db.transaction((tx) =>
    settleBaccaratRoundInTransaction(tx, normalizedInput),
  );
}

export async function settleBaccaratRoundInTransaction(
  tx: WalletMutationTransaction,
  input: SettleBaccaratRoundInput,
): Promise<SettleBaccaratRoundResult> {
  const round = await lockBaccaratRound(tx, input.roundId);

  if (round.status === "CANCELLED") {
    throw new BaccaratSettlementError(
      "INVALID_SETTLEMENT",
      `Baccarat round ${input.roundId} is cancelled.`,
    );
  }

  if (round.status === "SETTLED") {
    assertSettledRoundMatchesInput(round, input);

    return readSettledBaccaratRoundResult(tx, input);
  }

  if (!["DEALING", "SQUEEZE", "SETTLING"].includes(round.status)) {
    throw new BaccaratSettlementError(
      "INVALID_SETTLEMENT",
      `Baccarat round ${input.roundId} is not ready for settlement.`,
    );
  }

  const settledAt = new Date();

  if (round.status !== "SETTLING") {
    await tx
      .update(baccaratRounds)
      .set({
        status: "SETTLING",
        updatedAt: settledAt,
      })
      .where(eq(baccaratRounds.id, input.roundId));
  }

  const bets = await findBaccaratBetsByRound(tx, input.roundId);
  const betResults: SettleBaccaratBetResult[] = [];

  for (const bet of bets) {
    const result = await settleBaccaratBet(tx, bet, input, settledAt);

    betResults.push(result);
  }

  await tx
    .update(baccaratRounds)
    .set(buildRoundSettlementUpdate(input, settledAt))
    .where(eq(baccaratRounds.id, input.roundId));

  return {
    roundId: input.roundId,
    outcome: input.outcome,
    bets: betResults,
  };
}

export async function cancelBaccaratRound(
  input: CancelBaccaratRoundInput,
): Promise<CancelBaccaratRoundResult> {
  const normalizedInput = normalizeCancelBaccaratRoundInput(input);

  return db.transaction((tx) =>
    cancelBaccaratRoundInTransaction(tx, normalizedInput),
  );
}

export async function cancelBaccaratRoundInTransaction(
  tx: WalletMutationTransaction,
  input: CancelBaccaratRoundInput,
): Promise<CancelBaccaratRoundResult> {
  const round = await lockBaccaratRound(tx, input.roundId);

  if (round.status === "CANCELLED") {
    return readCancelledBaccaratRoundResult(tx, input);
  }

  if (round.status === "SETTLED") {
    throw new BaccaratSettlementError(
      "INVALID_CANCEL",
      `Baccarat round ${input.roundId} is already settled.`,
    );
  }

  const cancelledAt = new Date();
  const bets = await findBaccaratBetsByRound(tx, input.roundId);
  const betResults: CancelBaccaratBetResult[] = [];

  for (const bet of bets) {
    const result = await cancelBaccaratBet(tx, bet, input, cancelledAt);

    betResults.push(result);
  }

  await tx
    .update(baccaratRounds)
    .set({
      status: "CANCELLED",
      cancelledAt,
      cancelReason: input.reason,
      updatedAt: cancelledAt,
    })
    .where(eq(baccaratRounds.id, input.roundId));

  return {
    roundId: input.roundId,
    bets: betResults,
  };
}

async function settleBaccaratBet(
  tx: WalletMutationTransaction,
  bet: typeof baccaratBets.$inferSelect,
  input: SettleBaccaratRoundInput,
  settledAt: Date,
): Promise<SettleBaccaratBetResult> {
  const betType = parseBaccaratOutcome(bet.betType);
  const plan = calculateBaccaratBetSettlement(bet, input.outcome);

  if (bet.status === "SETTLED") {
    return readSettledBaccaratBet(tx, bet, betType, plan);
  }

  if (bet.status !== "PLACED") {
    throw new BaccaratSettlementError(
      "SETTLEMENT_CONFLICT",
      `Baccarat bet ${bet.id} is already ${bet.status}.`,
    );
  }

  const walletMutation =
    plan.ledgerType === null
      ? null
      : await applyWalletMutationInTransaction(
          tx,
          buildSettlementWalletMutationInput(bet, betType, plan),
        );

  await tx
    .update(baccaratBets)
    .set({
      status: "SETTLED",
      payoutAmount: plan.payoutAmount,
      netAmount: plan.netAmount,
      settlementLedgerId:
        plan.ledgerType === "PAYOUT" ? walletMutation?.ledger.id ?? null : null,
      refundLedgerId:
        plan.ledgerType === "PUSH_REFUND"
          ? walletMutation?.ledger.id ?? null
          : null,
      settledAt,
      updatedAt: settledAt,
    })
    .where(eq(baccaratBets.id, bet.id));

  await insertBaccaratAction(tx, {
    roundId: input.roundId,
    betId: bet.id,
    userId: bet.userId,
    actorType: "SYSTEM",
    actionType: "SETTLE",
    commandId: `settle:${bet.id}`,
    amount: plan.payoutAmount,
    payload: buildSettlementActionPayload(betType, input.outcome, plan),
  });

  return {
    betId: bet.id,
    userId: bet.userId,
    betType,
    outcome: plan.outcome,
    payoutAmount: plan.payoutAmount,
    netAmount: plan.netAmount,
    walletMutation,
    ledgerType: plan.ledgerType,
  };
}

async function readSettledBaccaratBet(
  tx: WalletMutationTransaction,
  bet: typeof baccaratBets.$inferSelect,
  betType: BaccaratRoundOutcome,
  plan: BaccaratBetSettlementPlan,
): Promise<SettleBaccaratBetResult> {
  assertSettledBetMatchesPlan(bet, plan);

  const walletMutation =
    plan.ledgerType === null
      ? null
      : await applyWalletMutationInTransaction(
          tx,
          buildSettlementWalletMutationInput(bet, betType, plan),
        );

  if (
    plan.ledgerType === "PAYOUT" &&
    bet.settlementLedgerId &&
    walletMutation?.ledger.id !== bet.settlementLedgerId
  ) {
    throw new BaccaratSettlementError(
      "SETTLEMENT_CONFLICT",
      `Baccarat bet ${bet.id} payout ledger does not match the idempotent ledger.`,
    );
  }

  if (
    plan.ledgerType === "PUSH_REFUND" &&
    bet.refundLedgerId &&
    walletMutation?.ledger.id !== bet.refundLedgerId
  ) {
    throw new BaccaratSettlementError(
      "SETTLEMENT_CONFLICT",
      `Baccarat bet ${bet.id} push refund ledger does not match the idempotent ledger.`,
    );
  }

  return {
    betId: bet.id,
    userId: bet.userId,
    betType,
    outcome: plan.outcome,
    payoutAmount: plan.payoutAmount,
    netAmount: plan.netAmount,
    walletMutation,
    ledgerType: plan.ledgerType,
  };
}

async function cancelBaccaratBet(
  tx: WalletMutationTransaction,
  bet: typeof baccaratBets.$inferSelect,
  input: CancelBaccaratRoundInput,
  cancelledAt: Date,
): Promise<CancelBaccaratBetResult> {
  const betType = parseBaccaratOutcome(bet.betType);

  if (bet.status === "CANCELLED") {
    return readCancelledBaccaratBet(tx, bet, input, betType);
  }

  if (bet.status !== "PLACED") {
    throw new BaccaratSettlementError(
      "INVALID_CANCEL",
      `Baccarat bet ${bet.id} is already ${bet.status}.`,
    );
  }

  const walletMutation = await applyWalletMutationInTransaction(
    tx,
    buildCancelRefundWalletMutationInput(bet, betType, input.reason),
  );

  await tx
    .update(baccaratBets)
    .set({
      status: "CANCELLED",
      payoutAmount: bet.amount,
      netAmount: zero,
      refundLedgerId: walletMutation.ledger.id,
      settledAt: cancelledAt,
      updatedAt: cancelledAt,
    })
    .where(eq(baccaratBets.id, bet.id));

  await insertBaccaratAction(tx, {
    roundId: input.roundId,
    betId: bet.id,
    userId: bet.userId,
    actorType: "SYSTEM",
    actionType: "CANCEL",
    commandId: `cancel:${bet.id}`,
    amount: bet.amount,
    payload: {
      betType,
      reason: input.reason,
      refundAmount: bet.amount.toString(),
    },
  });

  return {
    betId: bet.id,
    userId: bet.userId,
    betType,
    refundAmount: bet.amount,
    walletMutation,
    ledgerType: "CANCEL_REFUND",
  };
}

async function readCancelledBaccaratBet(
  tx: WalletMutationTransaction,
  bet: typeof baccaratBets.$inferSelect,
  input: CancelBaccaratRoundInput,
  betType: BaccaratRoundOutcome,
): Promise<CancelBaccaratBetResult> {
  assertCancelledBetMatchesPlan(bet);

  const walletMutation = await applyWalletMutationInTransaction(
    tx,
    buildCancelRefundWalletMutationInput(bet, betType, input.reason),
  );

  if (bet.refundLedgerId && walletMutation.ledger.id !== bet.refundLedgerId) {
    throw new BaccaratSettlementError(
      "SETTLEMENT_CONFLICT",
      `Baccarat bet ${bet.id} cancel refund ledger does not match the idempotent ledger.`,
    );
  }

  return {
    betId: bet.id,
    userId: bet.userId,
    betType,
    refundAmount: bet.amount,
    walletMutation,
    ledgerType: "CANCEL_REFUND",
  };
}

async function readSettledBaccaratRoundResult(
  tx: WalletMutationTransaction,
  input: SettleBaccaratRoundInput,
): Promise<SettleBaccaratRoundResult> {
  const bets = await findBaccaratBetsByRound(tx, input.roundId);
  const betResults: SettleBaccaratBetResult[] = [];

  for (const bet of bets) {
    const betType = parseBaccaratOutcome(bet.betType);
    const plan = calculateBaccaratBetSettlement(bet, input.outcome);

    if (bet.status !== "SETTLED") {
      throw new BaccaratSettlementError(
        "SETTLEMENT_CONFLICT",
        `Baccarat bet ${bet.id} is not settled.`,
      );
    }

    betResults.push(await readSettledBaccaratBet(tx, bet, betType, plan));
  }

  return {
    roundId: input.roundId,
    outcome: input.outcome,
    bets: betResults,
  };
}

async function readCancelledBaccaratRoundResult(
  tx: WalletMutationTransaction,
  input: CancelBaccaratRoundInput,
): Promise<CancelBaccaratRoundResult> {
  const bets = await findBaccaratBetsByRound(tx, input.roundId);
  const betResults: CancelBaccaratBetResult[] = [];

  for (const bet of bets) {
    if (bet.status !== "CANCELLED") {
      throw new BaccaratSettlementError(
        "INVALID_CANCEL",
        `Baccarat bet ${bet.id} is not cancelled.`,
      );
    }

    betResults.push(
      await readCancelledBaccaratBet(
        tx,
        bet,
        input,
        parseBaccaratOutcome(bet.betType),
      ),
    );
  }

  return {
    roundId: input.roundId,
    bets: betResults,
  };
}

async function lockBaccaratRound(
  tx: WalletMutationTransaction,
  roundId: string,
): Promise<LockedBaccaratRound> {
  const result = await tx.execute(sql<LockedBaccaratRound>`
    select
      id,
      table_id as "tableId",
      shoe_id as "shoeId",
      round_no as "roundNo",
      status,
      outcome,
      player_total as "playerTotal",
      banker_total as "bankerTotal",
      is_natural as "isNatural",
      total_cards as "totalCards",
      cancel_reason as "cancelReason"
    from baccarat_rounds
    where id = ${roundId}
    for update
  `);
  const [round] = getRows<LockedBaccaratRound>(result);

  if (!round) {
    throw new BaccaratSettlementError(
      "ROUND_NOT_FOUND",
      `Baccarat round ${roundId} was not found.`,
    );
  }

  return round;
}

async function findBaccaratBetsByRound(
  tx: WalletMutationTransaction,
  roundId: string,
) {
  return tx
    .select()
    .from(baccaratBets)
    .where(eq(baccaratBets.roundId, roundId))
    .orderBy(baccaratBets.createdAt, baccaratBets.id);
}

function calculateBaccaratBetSettlement(
  bet: typeof baccaratBets.$inferSelect,
  outcome: BaccaratRoundOutcome,
): BaccaratBetSettlementPlan {
  const betType = parseBaccaratOutcome(bet.betType);

  if (outcome === "TIE" && betType !== "TIE") {
    return {
      outcome: "PUSH",
      payoutAmount: bet.amount,
      netAmount: zero,
      ledgerType: "PUSH_REFUND",
    };
  }

  if (betType === outcome) {
    const payoutAmount = calculateSnapshotPayoutAmount(bet);

    return {
      outcome: "WIN",
      payoutAmount,
      netAmount: payoutAmount - bet.amount,
      ledgerType: "PAYOUT",
    };
  }

  return {
    outcome: "LOSE",
    payoutAmount: zero,
    netAmount: -bet.amount,
    ledgerType: null,
  };
}

function calculateSnapshotPayoutAmount(
  bet: typeof baccaratBets.$inferSelect,
) {
  if (bet.oddsDenominator <= 0) {
    throw new BaccaratSettlementError(
      "INVALID_SETTLEMENT",
      `Baccarat bet ${bet.id} has invalid odds denominator.`,
    );
  }

  return (bet.amount * BigInt(bet.oddsNumerator)) / BigInt(bet.oddsDenominator);
}

function buildSettlementWalletMutationInput(
  bet: typeof baccaratBets.$inferSelect,
  betType: BaccaratRoundOutcome,
  plan: BaccaratBetSettlementPlan,
) {
  if (plan.ledgerType === null) {
    throw new BaccaratSettlementError(
      "INVALID_SETTLEMENT",
      `Baccarat bet ${bet.id} has no settlement ledger for ${plan.outcome}.`,
    );
  }

  return {
    userId: bet.userId,
    category: "GAME" as const,
    gameType: "BACCARAT" as const,
    type: plan.ledgerType,
    delta: plan.payoutAmount,
    referenceType: "BACCARAT_ROUND",
    referenceId: bet.roundId,
    idempotencyKey:
      plan.ledgerType === "PUSH_REFUND"
        ? `baccarat:push:${bet.roundId}:${bet.id}`
        : `baccarat:settlement:${bet.roundId}:${bet.id}`,
    memo:
      plan.ledgerType === "PUSH_REFUND"
        ? `Baccarat ${betType} push refund for bet ${bet.id}`
        : `Baccarat ${betType} payout for bet ${bet.id}`,
    metadata: {
      betId: bet.id,
      betType,
      outcome: plan.outcome,
      payoutAmount: plan.payoutAmount.toString(),
      netAmount: plan.netAmount.toString(),
      oddsNumerator: bet.oddsNumerator,
      oddsDenominator: bet.oddsDenominator,
      commissionBpsSnapshot: bet.commissionBpsSnapshot,
    } satisfies JsonObject,
  };
}

function buildCancelRefundWalletMutationInput(
  bet: typeof baccaratBets.$inferSelect,
  betType: BaccaratRoundOutcome,
  reason: string,
) {
  return {
    userId: bet.userId,
    category: "GAME" as const,
    gameType: "BACCARAT" as const,
    type: "CANCEL_REFUND" as const,
    delta: bet.amount,
    referenceType: "BACCARAT_ROUND",
    referenceId: bet.roundId,
    idempotencyKey: `baccarat:cancel:${bet.roundId}:${bet.id}`,
    memo: `Baccarat cancelled round refund for bet ${bet.id}`,
    metadata: {
      betId: bet.id,
      betType,
      reason,
      refundAmount: bet.amount.toString(),
    } satisfies JsonObject,
  };
}

async function insertBaccaratAction(
  tx: WalletMutationTransaction,
  input: {
    roundId: string;
    betId?: string;
    userId?: string;
    actorType: "PLAYER" | "SYSTEM";
    actionType: "SETTLE" | "CANCEL";
    commandId?: string;
    amount: bigint;
    payload: JsonObject;
  },
) {
  await tx
    .insert(baccaratActions)
    .values({
      roundId: input.roundId,
      betId: input.betId ?? null,
      userId: input.userId ?? null,
      actorType: input.actorType,
      actionType: input.actionType,
      actionSequence: await nextActionSequence(tx, input.roundId),
      commandId: input.commandId ?? null,
      amount: input.amount,
      payload: input.payload,
    })
    .onConflictDoNothing();
}

async function nextActionSequence(
  tx: WalletMutationTransaction,
  roundId: string,
) {
  const result = await tx.execute(sql<{ actionSequence: number }>`
    select coalesce(max(action_sequence), 0) + 1 as "actionSequence"
    from baccarat_actions
    where round_id = ${roundId}
  `);
  const [row] = getRows<{ actionSequence: number }>(result);

  return Number(row?.actionSequence ?? 1);
}

function buildSettlementActionPayload(
  betType: BaccaratRoundOutcome,
  roundOutcome: BaccaratRoundOutcome,
  plan: BaccaratBetSettlementPlan,
): JsonObject {
  return {
    betType,
    roundOutcome,
    outcome: plan.outcome,
    ledgerType: plan.ledgerType,
    payoutAmount: plan.payoutAmount.toString(),
    netAmount: plan.netAmount.toString(),
  };
}

function buildRoundSettlementUpdate(
  input: SettleBaccaratRoundInput,
  settledAt: Date,
): Partial<typeof baccaratRounds.$inferInsert> {
  const update: Partial<typeof baccaratRounds.$inferInsert> = {
    status: "SETTLED",
    outcome: input.outcome,
    isNatural: input.isNatural ?? false,
    settledAt,
    updatedAt: settledAt,
  };

  if (input.playerTotal !== undefined) {
    update.playerTotal = input.playerTotal;
  }

  if (input.bankerTotal !== undefined) {
    update.bankerTotal = input.bankerTotal;
  }

  if (input.totalCards !== undefined) {
    update.totalCards = input.totalCards;
  }

  if (input.playerCards !== undefined) {
    update.playerCards = input.playerCards;
  }

  if (input.bankerCards !== undefined) {
    update.bankerCards = input.bankerCards;
  }

  if (input.resultFlags !== undefined) {
    update.resultFlags = input.resultFlags;
  }

  if (input.roadmapSnapshot !== undefined) {
    update.roadmapSnapshot = input.roadmapSnapshot;
  }

  return update;
}

function assertSettledRoundMatchesInput(
  round: LockedBaccaratRound,
  input: SettleBaccaratRoundInput,
) {
  if (round.outcome !== input.outcome) {
    throw new BaccaratSettlementError(
      "SETTLEMENT_CONFLICT",
      `Baccarat round ${input.roundId} is already settled with a different outcome.`,
    );
  }

  if (input.playerTotal !== undefined && round.playerTotal !== input.playerTotal) {
    throw new BaccaratSettlementError(
      "SETTLEMENT_CONFLICT",
      `Baccarat round ${input.roundId} player total does not match existing settlement.`,
    );
  }

  if (input.bankerTotal !== undefined && round.bankerTotal !== input.bankerTotal) {
    throw new BaccaratSettlementError(
      "SETTLEMENT_CONFLICT",
      `Baccarat round ${input.roundId} banker total does not match existing settlement.`,
    );
  }

  if (input.totalCards !== undefined && round.totalCards !== input.totalCards) {
    throw new BaccaratSettlementError(
      "SETTLEMENT_CONFLICT",
      `Baccarat round ${input.roundId} total card count does not match existing settlement.`,
    );
  }
}

function assertSettledBetMatchesPlan(
  bet: typeof baccaratBets.$inferSelect,
  plan: BaccaratBetSettlementPlan,
) {
  const expectedSettlementLedger =
    plan.ledgerType === "PAYOUT" ? bet.settlementLedgerId : null;
  const expectedRefundLedger =
    plan.ledgerType === "PUSH_REFUND" ? bet.refundLedgerId : null;

  if (
    bet.payoutAmount !== plan.payoutAmount ||
    bet.netAmount !== plan.netAmount ||
    (plan.ledgerType === "PAYOUT" && !expectedSettlementLedger) ||
    (plan.ledgerType === "PUSH_REFUND" && !expectedRefundLedger) ||
    (plan.ledgerType === null &&
      (bet.settlementLedgerId !== null || bet.refundLedgerId !== null))
  ) {
    throw new BaccaratSettlementError(
      "SETTLEMENT_CONFLICT",
      `Baccarat bet ${bet.id} is already settled with different results.`,
    );
  }
}

function assertCancelledBetMatchesPlan(bet: typeof baccaratBets.$inferSelect) {
  if (
    bet.payoutAmount !== bet.amount ||
    bet.netAmount !== zero ||
    !bet.refundLedgerId
  ) {
    throw new BaccaratSettlementError(
      "SETTLEMENT_CONFLICT",
      `Baccarat bet ${bet.id} is already cancelled with different results.`,
    );
  }
}

function normalizeSettleBaccaratRoundInput(
  input: SettleBaccaratRoundInput,
): SettleBaccaratRoundInput {
  const roundId = input.roundId.trim();
  const outcome = parseBaccaratOutcome(input.outcome);

  if (!roundId) {
    throw new BaccaratSettlementError(
      "INVALID_SETTLEMENT",
      "roundId is required for Baccarat settlement.",
    );
  }

  validateOptionalTotal(input.playerTotal, "playerTotal");
  validateOptionalTotal(input.bankerTotal, "bankerTotal");

  if (
    input.totalCards !== undefined &&
    input.totalCards !== null &&
    (!Number.isInteger(input.totalCards) ||
      input.totalCards < 4 ||
      input.totalCards > 6)
  ) {
    throw new BaccaratSettlementError(
      "INVALID_SETTLEMENT",
      "totalCards must be an integer between 4 and 6.",
    );
  }

  return {
    ...input,
    roundId,
    outcome,
  };
}

function normalizeCancelBaccaratRoundInput(
  input: CancelBaccaratRoundInput,
): CancelBaccaratRoundInput {
  const roundId = input.roundId.trim();
  const reason = input.reason.trim();

  if (!roundId || !reason) {
    throw new BaccaratSettlementError(
      "INVALID_CANCEL",
      "roundId and reason are required for Baccarat cancellation.",
    );
  }

  return {
    roundId,
    reason,
  };
}

function validateOptionalTotal(
  total: number | null | undefined,
  fieldName: string,
) {
  if (
    total !== undefined &&
    total !== null &&
    (!Number.isInteger(total) || total < 0 || total > 9)
  ) {
    throw new BaccaratSettlementError(
      "INVALID_SETTLEMENT",
      `${fieldName} must be an integer between 0 and 9.`,
    );
  }
}

function parseBaccaratOutcome(value: string): BaccaratRoundOutcome {
  if (baccaratRoundOutcomes.has(value as BaccaratRoundOutcome)) {
    return value as BaccaratRoundOutcome;
  }

  throw new BaccaratSettlementError(
    "INVALID_SETTLEMENT",
    `Unsupported Baccarat outcome ${value}.`,
  );
}

function getRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }

  return [];
}
