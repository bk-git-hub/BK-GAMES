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
  handNo: number;
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
  handNo: number;
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

type RoundSeatAggregate = {
  roundSeat: typeof blackjackRoundSeats.$inferSelect;
  wagerAmount: bigint;
  payoutAmount: bigint;
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
  const roundSeatAggregates = new Map<string, RoundSeatAggregate>();
  const seenHands = new Set<string>();

  for (const seatInput of input.seats) {
    const handKey = `${seatInput.roundSeatId}:${seatInput.handNo}`;

    if (seenHands.has(handKey)) {
      throw new BlackjackSettlementError(
        "SETTLEMENT_CONFLICT",
        `Hand ${handKey} was included more than once in settlement.`,
      );
    }

    seenHands.add(handKey);

    const roundSeat = await findRoundSeatForSettlement(tx, input, seatInput);
    const hand = await findHandForSettlement(
      tx,
      seatInput.roundSeatId,
      seatInput.handNo,
    );
    const payoutAmount = calculatePayoutAmount(
      round.ruleSnapshot,
      hand.finalBetAmount,
      seatInput.outcome,
      seatInput.outcomeReason,
    );
    const netAmount = payoutAmount - hand.finalBetAmount;
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

    const existingAggregate = roundSeatAggregates.get(roundSeat.id);

    roundSeatAggregates.set(roundSeat.id, {
      roundSeat,
      wagerAmount:
        (existingAggregate?.wagerAmount ?? zero) + hand.finalBetAmount,
      payoutAmount: (existingAggregate?.payoutAmount ?? zero) + payoutAmount,
    });

    await insertSettleActionIfMissing(tx, {
      roundId: input.roundId,
      roundSeatId: seatInput.roundSeatId,
      handNo: seatInput.handNo,
      handId: hand.id,
      userId: seatInput.userId,
      payoutAmount,
      payload: {
        seatNo: seatInput.seatNo,
        handNo: seatInput.handNo,
        outcome: seatInput.outcome,
        outcomeReason: seatInput.outcomeReason,
      },
    });

    seats.push({
      roundSeatId: seatInput.roundSeatId,
      handNo: seatInput.handNo,
      userId: seatInput.userId,
      seatNo: seatInput.seatNo,
      outcome: seatInput.outcome,
      outcomeReason: seatInput.outcomeReason,
      payoutAmount,
      netAmount,
      walletMutation,
    });
  }

  for (const aggregate of roundSeatAggregates.values()) {
    if (aggregate.wagerAmount !== aggregate.roundSeat.totalWagerAmount) {
      throw new BlackjackSettlementError(
        "INVALID_SETTLEMENT",
        `Round seat ${aggregate.roundSeat.id} settlement does not include all active hand wagers.`,
      );
    }

    const netAmount =
      aggregate.payoutAmount - aggregate.roundSeat.totalWagerAmount;

    await tx
      .update(blackjackRoundSeats)
      .set({
        status: "SETTLED",
        totalPayoutAmount: aggregate.payoutAmount,
        netAmount,
        settledAt,
        updatedAt: settledAt,
      })
      .where(eq(blackjackRoundSeats.id, aggregate.roundSeat.id));
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

async function findHandForSettlement(
  tx: WalletMutationTransaction,
  roundSeatId: string,
  handNo: number,
) {
  const [hand] = await tx
    .select()
    .from(blackjackHands)
    .where(
      and(
        eq(blackjackHands.roundSeatId, roundSeatId),
        eq(blackjackHands.handNo, handNo),
      ),
    )
    .limit(1);

  if (!hand) {
    throw new BlackjackSettlementError(
      "INVALID_SETTLEMENT",
      `Hand ${handNo} for round seat ${roundSeatId} was not found.`,
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
    const hand = await findHandForSettlement(
      tx,
      seatInput.roundSeatId,
      seatInput.handNo,
    );

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
      handNo: seatInput.handNo,
      userId: seatInput.userId,
      seatNo: seatInput.seatNo,
      outcome: seatInput.outcome,
      outcomeReason: seatInput.outcomeReason,
      payoutAmount: hand.payoutAmount,
      netAmount: hand.netAmount,
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
    .from(blackjackHands)
    .where(
      and(
        eq(blackjackHands.roundSeatId, seatInput.roundSeatId),
        eq(blackjackHands.handNo, seatInput.handNo),
      ),
    )
    .limit(1);

  if (!ledger || ledger.payoutAmount === zero) {
    return null;
  }

  return applyWalletMutationInTransaction(
    tx,
    buildSettlementWalletMutationInput(
      roundId,
      seatInput,
      ledger.payoutAmount,
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
    idempotencyKey: `blackjack:settlement:${roundId}:${seatInput.roundSeatId}:${seatInput.handNo}`,
    memo: `Blackjack settlement for seat ${seatInput.seatNo} hand ${seatInput.handNo}`,
    metadata: {
      seatNo: seatInput.seatNo,
      roundSeatId: seatInput.roundSeatId,
      handNo: seatInput.handNo,
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
    handNo: number;
    handId: string;
    userId: string;
    payoutAmount: bigint;
    payload: JsonObject;
  },
) {
  const commandId = `settle:${input.roundSeatId}:${input.handNo}`;
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
    seats: input.seats.map((seat) => {
      const handNo = seat.handNo ?? 1;

      if (!Number.isInteger(handNo) || handNo < 1 || handNo > 4) {
        throw new BlackjackSettlementError(
          "INVALID_SETTLEMENT",
          "handNo must be an integer between 1 and 4.",
        );
      }

      return {
        ...seat,
        handNo,
        roundSeatId: seat.roundSeatId.trim(),
        userId: seat.userId.trim(),
        cards: seat.cards.map(showCard),
      };
    }),
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
