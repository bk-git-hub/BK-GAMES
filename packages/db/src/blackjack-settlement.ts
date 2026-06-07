import { and, eq, sql } from "drizzle-orm";

import { db } from "./client";
import {
  blackjackActions,
  blackjackHands,
  blackjackRoundSeats,
  blackjackRounds,
  type BlackjackRuleSnapshot,
  type CardSnapshot,
  type JsonObject,
} from "./schema";
import {
  applyWalletMutationInTransaction,
  type WalletMutationResult,
  type WalletMutationTransaction,
} from "./wallet-transactions";

export type BlackjackSettlementOutcome = "WIN" | "LOSE" | "PUSH";

export type BlackjackSettlementOutcomeReason =
  | "NATURAL_BLACKJACK"
  | "STANDARD"
  | "PLAYER_BUST"
  | "DEALER_BUST"
  | "SURRENDER"
  | "DEALER_BLACKJACK";

export type SettleBlackjackRoundInput = {
  roundId: string;
  dealer: {
    cards: CardSnapshot[];
    finalValue: number;
    hasBlackjack: boolean;
    busted: boolean;
  };
  seats: SettleBlackjackRoundSeatInput[];
};

export type SettleBlackjackRoundSeatInput = {
  roundSeatId: string;
  userId: string;
  seatNo: number;
  cards: CardSnapshot[];
  finalValue: number;
  isSoft: boolean;
  isNaturalBlackjack: boolean;
  busted: boolean;
  outcome: BlackjackSettlementOutcome;
  outcomeReason: BlackjackSettlementOutcomeReason;
};

export type SettleBlackjackRoundResult = {
  roundId: string;
  seats: SettleBlackjackRoundSeatResult[];
};

export type SettleBlackjackRoundSeatResult = {
  roundSeatId: string;
  userId: string;
  seatNo: number;
  outcome: BlackjackSettlementOutcome;
  outcomeReason: BlackjackSettlementOutcomeReason;
  payoutAmount: bigint;
  netAmount: bigint;
  walletMutation: WalletMutationResult | null;
};

export type BlackjackSettlementErrorCode =
  | "ROUND_NOT_FOUND"
  | "ROUND_SEAT_NOT_FOUND"
  | "INVALID_SETTLEMENT"
  | "SETTLEMENT_CONFLICT";

export class BlackjackSettlementError extends Error {
  constructor(
    readonly code: BlackjackSettlementErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BlackjackSettlementError";
  }
}

type LockedBlackjackRoundRow = {
  id: string;
  status: string;
  startedAt: Date | null;
  ruleSnapshot: BlackjackRuleSnapshot;
};

const zero = BigInt(0);

export async function settleBlackjackRound(
  input: SettleBlackjackRoundInput,
): Promise<SettleBlackjackRoundResult> {
  const normalizedInput = normalizeSettlementInput(input);

  return db.transaction((tx) =>
    settleBlackjackRoundInTransaction(tx, normalizedInput),
  );
}

export async function settleBlackjackRoundInTransaction(
  tx: WalletMutationTransaction,
  input: SettleBlackjackRoundInput,
): Promise<SettleBlackjackRoundResult> {
  const round = await lockBlackjackRound(tx, input.roundId);

  if (round.status === "SETTLED") {
    return readSettledRoundResult(tx, input);
  }

  if (round.status === "CANCELLED") {
    throw new BlackjackSettlementError(
      "INVALID_SETTLEMENT",
      `Round ${input.roundId} is cancelled.`,
    );
  }

  const settledAt = new Date();
  const seats: SettleBlackjackRoundSeatResult[] = [];

  for (const seatInput of input.seats) {
    const roundSeat = await findRoundSeatForSettlement(tx, input, seatInput);
    const hand = await findPrimaryHand(tx, seatInput.roundSeatId);
    const payoutAmount = calculatePayoutAmount(
      round.ruleSnapshot,
      roundSeat.totalWagerAmount,
      seatInput.outcome,
      seatInput.outcomeReason,
    );
    const netAmount = payoutAmount - roundSeat.totalWagerAmount;
    const walletMutation =
      payoutAmount > zero
        ? await applyWalletMutationInTransaction(
            tx,
            buildSettlementWalletMutationInput(
              input.roundId,
              seatInput,
              payoutAmount,
            ),
          )
        : null;

    await tx
      .update(blackjackHands)
      .set({
        status: "SETTLED",
        cards: seatInput.cards,
        payoutAmount,
        netAmount,
        outcome: seatInput.outcome,
        outcomeReason: seatInput.outcomeReason,
        handValue: seatInput.finalValue,
        isSoft: seatInput.isSoft,
        isNaturalBlackjack: seatInput.isNaturalBlackjack,
        settledAt,
        updatedAt: settledAt,
      })
      .where(eq(blackjackHands.id, hand.id));

    await tx
      .update(blackjackRoundSeats)
      .set({
        status: "SETTLED",
        totalPayoutAmount: payoutAmount,
        netAmount,
        settledAt,
        updatedAt: settledAt,
      })
      .where(eq(blackjackRoundSeats.id, roundSeat.id));

    await insertSettleActionIfMissing(tx, {
      roundId: input.roundId,
      roundSeatId: seatInput.roundSeatId,
      handId: hand.id,
      userId: seatInput.userId,
      payoutAmount,
      payload: {
        seatNo: seatInput.seatNo,
        outcome: seatInput.outcome,
        outcomeReason: seatInput.outcomeReason,
      },
    });

    seats.push({
      roundSeatId: seatInput.roundSeatId,
      userId: seatInput.userId,
      seatNo: seatInput.seatNo,
      outcome: seatInput.outcome,
      outcomeReason: seatInput.outcomeReason,
      payoutAmount,
      netAmount,
      walletMutation,
    });
  }

  await tx
    .update(blackjackRounds)
    .set({
      status: "SETTLED",
      dealerCards: input.dealer.cards,
      dealerFinalValue: input.dealer.finalValue,
      dealerHasBlackjack: input.dealer.hasBlackjack,
      dealerBusted: input.dealer.busted,
      startedAt: round.startedAt ?? settledAt,
      settledAt,
      updatedAt: settledAt,
    })
    .where(eq(blackjackRounds.id, input.roundId));

  return {
    roundId: input.roundId,
    seats,
  };
}

async function lockBlackjackRound(
  tx: WalletMutationTransaction,
  roundId: string,
) {
  const result = await tx.execute(sql<LockedBlackjackRoundRow>`
    select
      id,
      status,
      started_at as "startedAt",
      rule_snapshot as "ruleSnapshot"
    from blackjack_rounds
    where id = ${roundId}
    for update
  `);
  const [round] = getRows<LockedBlackjackRoundRow>(result);

  if (!round) {
    throw new BlackjackSettlementError(
      "ROUND_NOT_FOUND",
      `Blackjack round ${roundId} was not found.`,
    );
  }

  return round;
}

async function findRoundSeatForSettlement(
  tx: WalletMutationTransaction,
  roundInput: SettleBlackjackRoundInput,
  seatInput: SettleBlackjackRoundSeatInput,
) {
  const [roundSeat] = await tx
    .select()
    .from(blackjackRoundSeats)
    .where(
      and(
        eq(blackjackRoundSeats.id, seatInput.roundSeatId),
        eq(blackjackRoundSeats.roundId, roundInput.roundId),
      ),
    )
    .limit(1);

  if (!roundSeat) {
    throw new BlackjackSettlementError(
      "ROUND_SEAT_NOT_FOUND",
      `Round seat ${seatInput.roundSeatId} was not found.`,
    );
  }

  if (
    roundSeat.userId !== seatInput.userId ||
    roundSeat.seatNo !== seatInput.seatNo
  ) {
    throw new BlackjackSettlementError(
      "SETTLEMENT_CONFLICT",
      `Round seat ${seatInput.roundSeatId} does not match the settlement payload.`,
    );
  }

  return roundSeat;
}

async function findPrimaryHand(
  tx: WalletMutationTransaction,
  roundSeatId: string,
) {
  const [hand] = await tx
    .select()
    .from(blackjackHands)
    .where(
      and(
        eq(blackjackHands.roundSeatId, roundSeatId),
        eq(blackjackHands.handNo, 1),
      ),
    )
    .limit(1);

  if (!hand) {
    throw new BlackjackSettlementError(
      "INVALID_SETTLEMENT",
      `Primary hand for round seat ${roundSeatId} was not found.`,
    );
  }

  return hand;
}

async function readSettledRoundResult(
  tx: WalletMutationTransaction,
  input: SettleBlackjackRoundInput,
): Promise<SettleBlackjackRoundResult> {
  const seats: SettleBlackjackRoundSeatResult[] = [];

  for (const seatInput of input.seats) {
    const roundSeat = await findRoundSeatForSettlement(tx, input, seatInput);
    const hand = await findPrimaryHand(tx, seatInput.roundSeatId);

    if (
      roundSeat.status !== "SETTLED" ||
      hand.outcome !== seatInput.outcome ||
      hand.outcomeReason !== seatInput.outcomeReason
    ) {
      throw new BlackjackSettlementError(
        "SETTLEMENT_CONFLICT",
        `Round seat ${seatInput.roundSeatId} is already settled with different results.`,
      );
    }

    seats.push({
      roundSeatId: seatInput.roundSeatId,
      userId: seatInput.userId,
      seatNo: seatInput.seatNo,
      outcome: seatInput.outcome,
      outcomeReason: seatInput.outcomeReason,
      payoutAmount: roundSeat.totalPayoutAmount,
      netAmount: roundSeat.netAmount,
      walletMutation: await findSettlementWalletMutation(
        tx,
        input.roundId,
        seatInput,
      ),
    });
  }

  return {
    roundId: input.roundId,
    seats,
  };
}

async function findSettlementWalletMutation(
  tx: WalletMutationTransaction,
  roundId: string,
  seatInput: SettleBlackjackRoundSeatInput,
): Promise<WalletMutationResult | null> {
  const [ledger] = await tx
    .select()
    .from(blackjackRoundSeats)
    .innerJoin(
      blackjackHands,
      eq(blackjackHands.roundSeatId, blackjackRoundSeats.id),
    )
    .where(eq(blackjackRoundSeats.id, seatInput.roundSeatId))
    .limit(1);

  if (!ledger || ledger.blackjack_round_seats.totalPayoutAmount === zero) {
    return null;
  }

  return applyWalletMutationInTransaction(
    tx,
    buildSettlementWalletMutationInput(
      roundId,
      seatInput,
      ledger.blackjack_round_seats.totalPayoutAmount,
    ),
  );
}

function calculatePayoutAmount(
  ruleSnapshot: BlackjackRuleSnapshot,
  wagerAmount: bigint,
  outcome: BlackjackSettlementOutcome,
  outcomeReason: BlackjackSettlementOutcomeReason,
) {
  if (outcomeReason === "SURRENDER") {
    if (outcome !== "LOSE") {
      throw new BlackjackSettlementError(
        "INVALID_SETTLEMENT",
        "Surrender settlement must be a losing outcome.",
      );
    }

    return wagerAmount / BigInt(2);
  }

  if (outcome === "LOSE") {
    return zero;
  }

  if (outcome === "PUSH") {
    return wagerAmount;
  }

  if (outcomeReason === "NATURAL_BLACKJACK") {
    const numerator = BigInt(ruleSnapshot.blackjackPayout.numerator);
    const denominator = BigInt(ruleSnapshot.blackjackPayout.denominator);

    if (denominator <= zero) {
      throw new BlackjackSettlementError(
        "INVALID_SETTLEMENT",
        "Blackjack payout denominator must be positive.",
      );
    }

    return wagerAmount + (wagerAmount * numerator) / denominator;
  }

  return wagerAmount * BigInt(2);
}

function buildSettlementWalletMutationInput(
  roundId: string,
  seatInput: SettleBlackjackRoundSeatInput,
  payoutAmount: bigint,
) {
  return {
    userId: seatInput.userId,
    category: "GAME" as const,
    gameType: "BLACKJACK" as const,
    type:
      seatInput.outcomeReason === "SURRENDER"
        ? ("SURRENDER_REFUND" as const)
        : seatInput.outcome === "PUSH"
        ? ("PUSH_REFUND" as const)
        : ("PAYOUT" as const),
    delta: payoutAmount,
    referenceType: "BLACKJACK_ROUND",
    referenceId: roundId,
    idempotencyKey: `blackjack:settlement:${roundId}:${seatInput.roundSeatId}`,
    memo: `Blackjack settlement for seat ${seatInput.seatNo}`,
    metadata: {
      seatNo: seatInput.seatNo,
      roundSeatId: seatInput.roundSeatId,
      outcome: seatInput.outcome,
      outcomeReason: seatInput.outcomeReason,
    } satisfies JsonObject,
  };
}

async function insertSettleActionIfMissing(
  tx: WalletMutationTransaction,
  input: {
    roundId: string;
    roundSeatId: string;
    handId: string;
    userId: string;
    payoutAmount: bigint;
    payload: JsonObject;
  },
) {
  const commandId = `settle:${input.roundSeatId}`;
  const [existingAction] = await tx
    .select()
    .from(blackjackActions)
    .where(
      and(
        eq(blackjackActions.roundId, input.roundId),
        eq(blackjackActions.commandId, commandId),
      ),
    )
    .limit(1);

  if (existingAction) {
    return;
  }

  await tx.insert(blackjackActions).values({
    roundId: input.roundId,
    roundSeatId: input.roundSeatId,
    handId: input.handId,
    userId: input.userId,
    actorType: "SYSTEM",
    actionType: "SETTLE",
    actionSequence: await nextActionSequence(tx, input.roundId),
    commandId,
    amount: input.payoutAmount,
    payload: input.payload,
  });
}

async function nextActionSequence(
  tx: WalletMutationTransaction,
  roundId: string,
) {
  const result = await tx.execute(sql<{ actionSequence: number }>`
    select coalesce(max(action_sequence), 0) + 1 as "actionSequence"
    from blackjack_actions
    where round_id = ${roundId}
  `);
  const [row] = getRows<{ actionSequence: number }>(result);

  return Number(row?.actionSequence ?? 1);
}

function normalizeSettlementInput(
  input: SettleBlackjackRoundInput,
): SettleBlackjackRoundInput {
  const roundId = input.roundId.trim();

  if (!roundId) {
    throw new BlackjackSettlementError(
      "INVALID_SETTLEMENT",
      "roundId is required.",
    );
  }

  if (input.seats.length === 0) {
    throw new BlackjackSettlementError(
      "INVALID_SETTLEMENT",
      "At least one seat is required for settlement.",
    );
  }

  return {
    roundId,
    dealer: {
      ...input.dealer,
      cards: input.dealer.cards.map(showCard),
    },
    seats: input.seats.map((seat) => ({
      ...seat,
      roundSeatId: seat.roundSeatId.trim(),
      userId: seat.userId.trim(),
      cards: seat.cards.map(showCard),
    })),
  };
}

function showCard(card: CardSnapshot): CardSnapshot {
  return {
    rank: card.rank,
    suit: card.suit,
  };
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
