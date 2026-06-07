import { and, desc, eq, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";

import { db } from "./client";
import {
  blackjackActions,
  blackjackHands,
  blackjackRoundSeats,
  blackjackRounds,
  blackjackSideBets,
  blackjackShoes,
  blackjackTables,
  type BlackjackRuleSnapshot,
  type JsonObject,
} from "./schema";
import {
  applyWalletMutationInTransaction,
  getActiveWalletForUpdate,
  type WalletMutationResult,
  type WalletMutationTransaction,
} from "./wallet-transactions";

export const MAIN_BLACKJACK_TABLE_CODE = "main";

const defaultMinInitialBet = BigInt(100);
const defaultMaxInitialBet = BigInt(6000);
const defaultMaxTotalBetPerSeat = BigInt(24000);
const defaultMaxTotalBetPerUser = BigInt(42000);
const zero = BigInt(0);
const ten = BigInt(10);

export type BlackjackBettingErrorCode =
  | "TABLE_NOT_FOUND"
  | "TABLE_NOT_OPEN"
  | "INVALID_TABLE_ID"
  | "INVALID_SEAT_NO"
  | "INVALID_COMMAND_ID"
  | "INVALID_BET_AMOUNT"
  | "ROUND_NOT_ACTIVE"
  | "ROUND_SEAT_NOT_FOUND"
  | "BETTING_CLOSED"
  | "BET_ALREADY_PLACED"
  | "BET_TOO_LOW"
  | "BET_TOO_HIGH"
  | "ACTION_NOT_ALLOWED"
  | "IDEMPOTENCY_CONFLICT";

export class BlackjackBettingError extends Error {
  constructor(
    readonly code: BlackjackBettingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BlackjackBettingError";
  }
}

export type PlaceBlackjackInitialBetInput = {
  tableCode: string;
  seatNo: number;
  userId: string;
  amount: bigint;
  commandId: string;
};

export type PlaceBlackjackInitialBetResult = {
  table: BlackjackRuntimeTable;
  round: typeof blackjackRounds.$inferSelect;
  roundSeat: typeof blackjackRoundSeats.$inferSelect;
  walletMutation: WalletMutationResult;
  maxInitialBet: bigint;
};

export type DoubleBlackjackBetInput = {
  roundId: string;
  roundSeatId: string;
  seatNo: number;
  userId: string;
  commandId: string;
};

export type DoubleBlackjackBetResult = {
  roundId: string;
  roundSeatId: string;
  seatNo: number;
  userId: string;
  amount: bigint;
  totalWagerAmount: bigint;
  walletMutation: WalletMutationResult;
};

export type SplitBlackjackBetInput = {
  roundId: string;
  roundSeatId: string;
  seatNo: number;
  sourceHandNo: number;
  userId: string;
  commandId: string;
};

export type SplitBlackjackBetResult = {
  roundId: string;
  roundSeatId: string;
  seatNo: number;
  sourceHandNo: number;
  newHandNo: number;
  userId: string;
  amount: bigint;
  totalWagerAmount: bigint;
  walletMutation: WalletMutationResult;
};

export type PlaceBlackjackInsuranceBetInput = {
  roundId: string;
  roundSeatId: string;
  seatNo: number;
  userId: string;
  commandId: string;
};

export type PlaceBlackjackInsuranceBetResult = {
  roundId: string;
  roundSeatId: string;
  seatNo: number;
  userId: string;
  amount: bigint;
  walletMutation: WalletMutationResult;
};

export type BlackjackRuntimeTable = {
  id: string;
  code: string;
  name: string;
  status: "OPEN" | "MAINTENANCE" | "CLOSED";
  minInitialBet: bigint;
  maxInitialBet: bigint;
  maxTotalBetPerSeat: bigint;
  maxTotalBetPerUser: bigint;
  maxSeats: number;
  maxSeatsPerUser: number;
  bettingTimeoutSeconds: number;
  actionTimeoutSeconds: number;
  deckCount: number;
  shoePenetrationPercent: number;
  dealerHitsSoft17: boolean;
  blackjackPayoutNumerator: number;
  blackjackPayoutDenominator: number;
  insuranceAllowed: boolean;
  evenMoneyAllowed: boolean;
  surrenderMode: BlackjackRuleSnapshot["surrenderMode"];
  doubleAllowed: boolean;
  doubleAfterSplitAllowed: boolean;
  splitAllowed: boolean;
  maxSplitHands: number;
  resplitAcesAllowed: boolean;
  hitSplitAcesAllowed: boolean;
  dealerPeekEnabled: boolean;
  cardCountingMode: BlackjackRuleSnapshot["cardCountingMode"];
};

type LockedBlackjackTableRow = Omit<
  BlackjackRuntimeTable,
  "status" | "surrenderMode" | "cardCountingMode"
> & {
  status: string;
  surrenderMode: string;
  cardCountingMode: string;
};

type LockedDoubleDownContext = {
  roundId: string;
  roundStatus: string;
  ruleSnapshot: BlackjackRuleSnapshot;
  tableMaxTotalBetPerSeat: bigint;
  tableMaxTotalBetPerUser: bigint;
  roundSeatId: string;
  seatNo: number;
  userId: string;
  roundSeatStatus: string;
  totalWagerAmount: bigint;
  handId: string;
  handStatus: string;
  initialBetAmount: bigint;
  finalBetAmount: bigint;
  isDoubled: boolean;
};

type LockedDoubleDownContextRow = Omit<
  LockedDoubleDownContext,
  | "tableMaxTotalBetPerSeat"
  | "tableMaxTotalBetPerUser"
  | "totalWagerAmount"
  | "initialBetAmount"
  | "finalBetAmount"
> & {
  tableMaxTotalBetPerSeat: bigint | string;
  tableMaxTotalBetPerUser: bigint | string;
  totalWagerAmount: bigint | string;
  initialBetAmount: bigint | string;
  finalBetAmount: bigint | string;
};

type LockedSplitContext = {
  roundId: string;
  roundStatus: string;
  ruleSnapshot: BlackjackRuleSnapshot;
  tableMaxTotalBetPerSeat: bigint;
  tableMaxTotalBetPerUser: bigint;
  roundSeatId: string;
  seatNo: number;
  userId: string;
  roundSeatStatus: string;
  totalWagerAmount: bigint;
  sourceHandId: string;
  sourceHandNo: number;
  sourceHandStatus: string;
  sourceHandInitialBetAmount: bigint;
  sourceHandFinalBetAmount: bigint;
  sourceHandIsDoubled: boolean;
  sourceHandIsSplitHand: boolean;
  handCount: number;
  newHandNo: number;
};

type LockedSplitContextRow = Omit<
  LockedSplitContext,
  | "tableMaxTotalBetPerSeat"
  | "tableMaxTotalBetPerUser"
  | "totalWagerAmount"
  | "sourceHandInitialBetAmount"
  | "sourceHandFinalBetAmount"
> & {
  tableMaxTotalBetPerSeat: bigint | string;
  tableMaxTotalBetPerUser: bigint | string;
  totalWagerAmount: bigint | string;
  sourceHandInitialBetAmount: bigint | string;
  sourceHandFinalBetAmount: bigint | string;
};

type LockedInsuranceContext = {
  roundId: string;
  roundStatus: string;
  ruleSnapshot: BlackjackRuleSnapshot;
  roundSeatId: string;
  seatNo: number;
  userId: string;
  roundSeatStatus: string;
  handId: string;
  handStatus: string;
  initialBetAmount: bigint;
};

type LockedInsuranceContextRow = Omit<
  LockedInsuranceContext,
  "initialBetAmount"
> & {
  initialBetAmount: bigint | string;
};

export async function ensureMainBlackjackTable() {
  return db.transaction(async (tx) => {
    const existing = await findBlackjackTableByCode(
      tx,
      MAIN_BLACKJACK_TABLE_CODE,
    );

    if (existing) {
      return existing;
    }

    const [table] = await tx
      .insert(blackjackTables)
      .values({
        code: MAIN_BLACKJACK_TABLE_CODE,
        name: "Main Blackjack Table",
        minInitialBet: defaultMinInitialBet,
        maxInitialBet: defaultMaxInitialBet,
        maxTotalBetPerSeat: defaultMaxTotalBetPerSeat,
        maxTotalBetPerUser: defaultMaxTotalBetPerUser,
        maxSeats: 7,
        maxSeatsPerUser: 7,
      })
      .onConflictDoNothing({ target: blackjackTables.code })
      .returning();

    if (table) {
      return toRuntimeTable(table);
    }

    const concurrentTable = await findBlackjackTableByCode(
      tx,
      MAIN_BLACKJACK_TABLE_CODE,
    );

    if (!concurrentTable) {
      throw new BlackjackBettingError(
        "TABLE_NOT_FOUND",
        "Failed to create the main blackjack table.",
      );
    }

    return concurrentTable;
  });
}

export async function placeBlackjackInitialBet(
  input: PlaceBlackjackInitialBetInput,
): Promise<PlaceBlackjackInitialBetResult> {
  const normalizedInput = normalizeInitialBetInput(input);

  return db.transaction((tx) =>
    placeBlackjackInitialBetInTransaction(tx, normalizedInput),
  );
}

export async function placeBlackjackInitialBetInTransaction(
  tx: WalletMutationTransaction,
  input: PlaceBlackjackInitialBetInput,
): Promise<PlaceBlackjackInitialBetResult> {
  const table = await lockBlackjackTableByCode(tx, input.tableCode);

  if (table.status !== "OPEN") {
    throw new BlackjackBettingError(
      "TABLE_NOT_OPEN",
      `Blackjack table ${input.tableCode} is ${table.status}.`,
    );
  }

  const round = await getOrCreateWaitingBetRound(tx, table);
  const serverCommandId = buildServerCommandId(input);
  const existingAction = await findBetActionByCommandId(
    tx,
    round.id,
    serverCommandId,
  );

  if (existingAction) {
    const roundSeat = await findRoundSeatById(tx, existingAction.roundSeatId);

    assertExistingBetActionMatches(existingAction, roundSeat, input);

    const walletMutation = await applyWalletMutationInTransaction(
      tx,
      buildBetWalletMutationInput(input, round.id, roundSeat.id),
    );
    const maxInitialBet = await calculateMaxInitialBet(tx, input.userId, table);

    return {
      table,
      round,
      roundSeat,
      walletMutation,
      maxInitialBet,
    };
  }

  await assertBetAmountAllowed(tx, {
    table,
    roundId: round.id,
    userId: input.userId,
    amount: input.amount,
  });
  await assertRoundSeatAvailable(tx, round.id, input.seatNo);

  const [roundSeat] = await tx
    .insert(blackjackRoundSeats)
    .values({
      roundId: round.id,
      tableId: table.id,
      seatNo: input.seatNo,
      userId: input.userId,
      initialBetAmount: input.amount,
      totalWagerAmount: input.amount,
      netAmount: -input.amount,
    })
    .returning();

  if (!roundSeat) {
    throw new BlackjackBettingError(
      "BET_ALREADY_PLACED",
      `Seat ${input.seatNo} already has a bet for this round.`,
    );
  }

  await tx.insert(blackjackHands).values({
    roundId: round.id,
    roundSeatId: roundSeat.id,
    handNo: 1,
    initialBetAmount: input.amount,
    finalBetAmount: input.amount,
    netAmount: -input.amount,
  });

  await tx.insert(blackjackActions).values({
    roundId: round.id,
    roundSeatId: roundSeat.id,
    userId: input.userId,
    actorType: "PLAYER",
    actionType: "PLACE_BET",
    actionSequence: await nextActionSequence(tx, round.id),
    commandId: serverCommandId,
    amount: input.amount,
    payload: {
      tableCode: input.tableCode,
      seatNo: input.seatNo,
      clientCommandId: input.commandId,
    },
  });

  const walletMutation = await applyWalletMutationInTransaction(
    tx,
    buildBetWalletMutationInput(input, round.id, roundSeat.id),
  );
  const maxInitialBet = calculateMaxInitialBetFromBalance(
    walletMutation.ledger.balanceBefore,
    table,
  );

  return {
    table,
    round,
    roundSeat,
    walletMutation,
    maxInitialBet,
  };
}

export async function doubleBlackjackBet(
  input: DoubleBlackjackBetInput,
): Promise<DoubleBlackjackBetResult> {
  const normalizedInput = normalizeDoubleBetInput(input);

  return db.transaction((tx) =>
    doubleBlackjackBetInTransaction(tx, normalizedInput),
  );
}

export async function doubleBlackjackBetInTransaction(
  tx: WalletMutationTransaction,
  input: DoubleBlackjackBetInput,
): Promise<DoubleBlackjackBetResult> {
  const context = await lockDoubleDownContext(tx, input);
  const doubleAmount = context.initialBetAmount;
  const serverCommandId = buildServerCommandId(input);
  const existingAction = await findBetActionByCommandId(
    tx,
    input.roundId,
    serverCommandId,
  );

  if (existingAction) {
    assertExistingDoubleActionMatches(existingAction, context, input);

    return {
      roundId: input.roundId,
      roundSeatId: input.roundSeatId,
      seatNo: input.seatNo,
      userId: input.userId,
      amount: doubleAmount,
      totalWagerAmount: context.totalWagerAmount,
      walletMutation: await applyWalletMutationInTransaction(
        tx,
        buildDoubleWalletMutationInput(input, doubleAmount),
      ),
    };
  }

  assertDoubleDownAllowed(context);
  await assertDoubleBetAmountAllowed(tx, {
    context,
    userId: input.userId,
    amount: doubleAmount,
  });

  const now = new Date();
  const totalWagerAmount = context.totalWagerAmount + doubleAmount;
  const finalBetAmount = context.finalBetAmount + doubleAmount;

  await tx
    .update(blackjackRoundSeats)
    .set({
      totalWagerAmount,
      netAmount: -totalWagerAmount,
      updatedAt: now,
    })
    .where(eq(blackjackRoundSeats.id, input.roundSeatId));

  await tx
    .update(blackjackHands)
    .set({
      status: "DOUBLED",
      finalBetAmount,
      netAmount: -finalBetAmount,
      isDoubled: true,
      updatedAt: now,
    })
    .where(eq(blackjackHands.id, context.handId));

  await tx.insert(blackjackActions).values({
    roundId: input.roundId,
    roundSeatId: input.roundSeatId,
    handId: context.handId,
    userId: input.userId,
    actorType: "PLAYER",
    actionType: "DOUBLE",
    actionSequence: await nextActionSequence(tx, input.roundId),
    commandId: serverCommandId,
    amount: doubleAmount,
    payload: {
      seatNo: input.seatNo,
      clientCommandId: input.commandId,
    },
  });

  const walletMutation = await applyWalletMutationInTransaction(
    tx,
    buildDoubleWalletMutationInput(input, doubleAmount),
  );

  return {
    roundId: input.roundId,
    roundSeatId: input.roundSeatId,
    seatNo: input.seatNo,
    userId: input.userId,
    amount: doubleAmount,
    totalWagerAmount,
    walletMutation,
  };
}

export async function splitBlackjackBet(
  input: SplitBlackjackBetInput,
): Promise<SplitBlackjackBetResult> {
  const normalizedInput = normalizeSplitBetInput(input);

  return db.transaction((tx) =>
    splitBlackjackBetInTransaction(tx, normalizedInput),
  );
}

export async function splitBlackjackBetInTransaction(
  tx: WalletMutationTransaction,
  input: SplitBlackjackBetInput,
): Promise<SplitBlackjackBetResult> {
  const context = await lockSplitContext(tx, input);
  const splitAmount = context.sourceHandInitialBetAmount;
  const serverCommandId = buildServerCommandId(input);
  const existingAction = await findBetActionByCommandId(
    tx,
    input.roundId,
    serverCommandId,
  );

  if (existingAction) {
    const newHandNo = assertExistingSplitActionMatches(
      existingAction,
      context,
      input,
    );

    return {
      roundId: input.roundId,
      roundSeatId: input.roundSeatId,
      seatNo: input.seatNo,
      sourceHandNo: input.sourceHandNo,
      newHandNo,
      userId: input.userId,
      amount: splitAmount,
      totalWagerAmount: context.totalWagerAmount,
      walletMutation: await applyWalletMutationInTransaction(
        tx,
        buildSplitWalletMutationInput(input, splitAmount),
      ),
    };
  }

  assertSplitAllowed(context);
  await assertSplitBetAmountAllowed(tx, {
    context,
    userId: input.userId,
    amount: splitAmount,
  });

  const now = new Date();
  const totalWagerAmount = context.totalWagerAmount + splitAmount;

  await tx
    .update(blackjackRoundSeats)
    .set({
      totalWagerAmount,
      netAmount: -totalWagerAmount,
      updatedAt: now,
    })
    .where(eq(blackjackRoundSeats.id, input.roundSeatId));

  await tx
    .update(blackjackHands)
    .set({
      isSplitHand: true,
      updatedAt: now,
    })
    .where(eq(blackjackHands.id, context.sourceHandId));

  const [newHand] = await tx
    .insert(blackjackHands)
    .values({
      roundId: input.roundId,
      roundSeatId: input.roundSeatId,
      handNo: context.newHandNo,
      sourceHandId: context.sourceHandId,
      initialBetAmount: splitAmount,
      finalBetAmount: splitAmount,
      netAmount: -splitAmount,
      isSplitHand: true,
    })
    .returning();

  if (!newHand) {
    throw new BlackjackBettingError(
      "ACTION_NOT_ALLOWED",
      `Failed to create split hand for round seat ${input.roundSeatId}.`,
    );
  }

  await tx.insert(blackjackActions).values({
    roundId: input.roundId,
    roundSeatId: input.roundSeatId,
    handId: context.sourceHandId,
    userId: input.userId,
    actorType: "PLAYER",
    actionType: "SPLIT",
    actionSequence: await nextActionSequence(tx, input.roundId),
    commandId: serverCommandId,
    amount: splitAmount,
    payload: {
      seatNo: input.seatNo,
      sourceHandNo: input.sourceHandNo,
      newHandNo: context.newHandNo,
      newHandId: newHand.id,
      clientCommandId: input.commandId,
    },
  });

  const walletMutation = await applyWalletMutationInTransaction(
    tx,
    buildSplitWalletMutationInput(input, splitAmount),
  );

  return {
    roundId: input.roundId,
    roundSeatId: input.roundSeatId,
    seatNo: input.seatNo,
    sourceHandNo: input.sourceHandNo,
    newHandNo: context.newHandNo,
    userId: input.userId,
    amount: splitAmount,
    totalWagerAmount,
    walletMutation,
  };
}

export async function placeBlackjackInsuranceBet(
  input: PlaceBlackjackInsuranceBetInput,
): Promise<PlaceBlackjackInsuranceBetResult> {
  const normalizedInput = normalizeInsuranceBetInput(input);

  return db.transaction((tx) =>
    placeBlackjackInsuranceBetInTransaction(tx, normalizedInput),
  );
}

export async function placeBlackjackInsuranceBetInTransaction(
  tx: WalletMutationTransaction,
  input: PlaceBlackjackInsuranceBetInput,
): Promise<PlaceBlackjackInsuranceBetResult> {
  const context = await lockInsuranceContext(tx, input);
  const amount = context.initialBetAmount / BigInt(2);
  const serverCommandId = buildServerCommandId(input);
  const existingAction = await findBetActionByCommandId(
    tx,
    input.roundId,
    serverCommandId,
  );

  if (existingAction) {
    assertExistingInsuranceActionMatches(existingAction, context, input, amount);

    return {
      roundId: input.roundId,
      roundSeatId: input.roundSeatId,
      seatNo: input.seatNo,
      userId: input.userId,
      amount,
      walletMutation: await applyWalletMutationInTransaction(
        tx,
        buildInsuranceWalletMutationInput(input, amount),
      ),
    };
  }

  assertInsuranceAllowed(context, amount);

  const [sideBet] = await tx
    .insert(blackjackSideBets)
    .values({
      roundId: input.roundId,
      roundSeatId: input.roundSeatId,
      type: "INSURANCE",
      amount,
      netAmount: -amount,
    })
    .onConflictDoNothing({
      target: [blackjackSideBets.roundSeatId, blackjackSideBets.type],
    })
    .returning();

  if (!sideBet) {
    throw new BlackjackBettingError(
      "ACTION_NOT_ALLOWED",
      `Insurance was already placed for round seat ${input.roundSeatId}.`,
    );
  }

  await tx.insert(blackjackActions).values({
    roundId: input.roundId,
    roundSeatId: input.roundSeatId,
    handId: context.handId,
    userId: input.userId,
    actorType: "PLAYER",
    actionType: "INSURANCE_ACCEPT",
    actionSequence: await nextActionSequence(tx, input.roundId),
    commandId: serverCommandId,
    amount,
    payload: {
      seatNo: input.seatNo,
      clientCommandId: input.commandId,
    },
  });

  const walletMutation = await applyWalletMutationInTransaction(
    tx,
    buildInsuranceWalletMutationInput(input, amount),
  );

  return {
    roundId: input.roundId,
    roundSeatId: input.roundSeatId,
    seatNo: input.seatNo,
    userId: input.userId,
    amount,
    walletMutation,
  };
}

async function findBlackjackTableByCode(
  tx: WalletMutationTransaction,
  tableCode: string,
) {
  const [table] = await tx
    .select()
    .from(blackjackTables)
    .where(eq(blackjackTables.code, tableCode))
    .limit(1);

  return table ? toRuntimeTable(table) : null;
}

async function lockBlackjackTableByCode(
  tx: WalletMutationTransaction,
  tableCode: string,
) {
  const result = await tx.execute(sql<LockedBlackjackTableRow>`
    select
      id,
      code,
      name,
      status,
      min_initial_bet as "minInitialBet",
      max_initial_bet as "maxInitialBet",
      max_total_bet_per_seat as "maxTotalBetPerSeat",
      max_total_bet_per_user as "maxTotalBetPerUser",
      max_seats as "maxSeats",
      max_seats_per_user as "maxSeatsPerUser",
      betting_timeout_seconds as "bettingTimeoutSeconds",
      action_timeout_seconds as "actionTimeoutSeconds",
      deck_count as "deckCount",
      shoe_penetration_percent as "shoePenetrationPercent",
      dealer_hits_soft_17 as "dealerHitsSoft17",
      blackjack_payout_numerator as "blackjackPayoutNumerator",
      blackjack_payout_denominator as "blackjackPayoutDenominator",
      insurance_allowed as "insuranceAllowed",
      even_money_allowed as "evenMoneyAllowed",
      surrender_mode as "surrenderMode",
      double_allowed as "doubleAllowed",
      double_after_split_allowed as "doubleAfterSplitAllowed",
      split_allowed as "splitAllowed",
      max_split_hands as "maxSplitHands",
      resplit_aces_allowed as "resplitAcesAllowed",
      hit_split_aces_allowed as "hitSplitAcesAllowed",
      dealer_peek_enabled as "dealerPeekEnabled",
      card_counting_mode as "cardCountingMode"
    from blackjack_tables
    where code = ${tableCode}
    for update
  `);
  const [table] = getRows<LockedBlackjackTableRow>(result);

  if (!table) {
    throw new BlackjackBettingError(
      "TABLE_NOT_FOUND",
      `Blackjack table ${tableCode} was not found.`,
    );
  }

  return toRuntimeTable(table);
}

async function getOrCreateWaitingBetRound(
  tx: WalletMutationTransaction,
  table: BlackjackRuntimeTable,
) {
  const existingRound = await findCurrentRound(tx, table.id);

  if (existingRound) {
    if (existingRound.status !== "WAITING_BETS") {
      throw new BlackjackBettingError(
        "BETTING_CLOSED",
        `Round ${existingRound.id} is already ${existingRound.status}.`,
      );
    }

    return existingRound;
  }

  const shoe = await getOrCreateReadyShoe(tx, table);
  const [round] = await tx
    .insert(blackjackRounds)
    .values({
      tableId: table.id,
      shoeId: shoe.id,
      roundNo: await nextRoundNo(tx, table.id),
      ruleSnapshot: buildRuleSnapshot(table),
      bettingOpensAt: new Date(),
      bettingClosesAt: new Date(
        Date.now() + table.bettingTimeoutSeconds * 1000,
      ),
    })
    .returning();

  if (!round) {
    throw new BlackjackBettingError(
      "BETTING_CLOSED",
      "Failed to create a blackjack round for betting.",
    );
  }

  return round;
}

async function findCurrentRound(
  tx: WalletMutationTransaction,
  tableId: string,
) {
  const [round] = await tx
    .select()
    .from(blackjackRounds)
    .where(
      and(
        eq(blackjackRounds.tableId, tableId),
        sql`${blackjackRounds.status} in (
          'WAITING_BETS',
          'DEALING',
          'PLAYER_TURNS',
          'DEALER_TURN',
          'SETTLING'
        )`,
      ),
    )
    .orderBy(desc(blackjackRounds.createdAt))
    .limit(1);

  return round ?? null;
}

async function getOrCreateReadyShoe(
  tx: WalletMutationTransaction,
  table: BlackjackRuntimeTable,
) {
  const [existingShoe] = await tx
    .select()
    .from(blackjackShoes)
    .where(
      and(
        eq(blackjackShoes.tableId, table.id),
        sql`${blackjackShoes.status} in ('READY', 'ACTIVE')`,
      ),
    )
    .orderBy(desc(blackjackShoes.createdAt))
    .limit(1);

  if (existingShoe) {
    return existingShoe;
  }

  const cardsTotal = table.deckCount * 52;
  const cutCardPosition = Math.max(
    1,
    Math.floor((cardsTotal * table.shoePenetrationPercent) / 100),
  );
  const [shoe] = await tx
    .insert(blackjackShoes)
    .values({
      tableId: table.id,
      deckCount: table.deckCount,
      cardsTotal,
      cutCardPosition,
      serverSeedHash: createHash("sha256").update(randomUUID()).digest("hex"),
    })
    .returning();

  if (!shoe) {
    throw new BlackjackBettingError(
      "BETTING_CLOSED",
      "Failed to create a blackjack shoe.",
    );
  }

  return shoe;
}

async function assertBetAmountAllowed(
  tx: WalletMutationTransaction,
  input: {
    table: BlackjackRuntimeTable;
    roundId: string;
    userId: string;
    amount: bigint;
  },
) {
  if (input.amount < input.table.minInitialBet) {
    throw new BlackjackBettingError(
      "BET_TOO_LOW",
      `Bet amount must be at least ${input.table.minInitialBet}.`,
    );
  }

  const lockedWallet = await getActiveWalletForUpdate(tx, input.userId);
  const maxInitialBet = calculateMaxInitialBetFromBalance(
    lockedWallet.balance - lockedWallet.lockedBalance,
    input.table,
  );

  if (input.amount > maxInitialBet) {
    throw new BlackjackBettingError(
      "BET_TOO_HIGH",
      `Bet amount must not exceed ${maxInitialBet}.`,
    );
  }

  const totalWagerForUser = await getActiveRoundWagerForUser(
    tx,
    input.roundId,
    input.userId,
  );

  if (totalWagerForUser + input.amount > input.table.maxTotalBetPerUser) {
    throw new BlackjackBettingError(
      "BET_TOO_HIGH",
      `Total user wager must not exceed ${input.table.maxTotalBetPerUser}.`,
    );
  }
}

async function assertRoundSeatAvailable(
  tx: WalletMutationTransaction,
  roundId: string,
  seatNo: number,
) {
  const [existingSeat] = await tx
    .select()
    .from(blackjackRoundSeats)
    .where(
      and(
        eq(blackjackRoundSeats.roundId, roundId),
        eq(blackjackRoundSeats.seatNo, seatNo),
      ),
    )
    .limit(1);

  if (existingSeat) {
    throw new BlackjackBettingError(
      "BET_ALREADY_PLACED",
      `Seat ${seatNo} already has a bet for this round.`,
    );
  }
}

async function getActiveRoundWagerForUser(
  tx: WalletMutationTransaction,
  roundId: string,
  userId: string,
) {
  const result = await tx.execute(sql<{ totalWager: bigint | string }>`
    select coalesce(sum(total_wager_amount), 0) as "totalWager"
    from blackjack_round_seats
    where round_id = ${roundId}
      and user_id = ${userId}
      and status = 'ACTIVE'
  `);
  const [row] = getRows<{ totalWager: bigint | string }>(result);

  return row ? toBigInt(row.totalWager) : zero;
}

async function lockDoubleDownContext(
  tx: WalletMutationTransaction,
  input: DoubleBlackjackBetInput,
): Promise<LockedDoubleDownContext> {
  const result = await tx.execute(sql<LockedDoubleDownContextRow>`
    select
      r.id as "roundId",
      r.status as "roundStatus",
      r.rule_snapshot as "ruleSnapshot",
      t.max_total_bet_per_seat as "tableMaxTotalBetPerSeat",
      t.max_total_bet_per_user as "tableMaxTotalBetPerUser",
      rs.id as "roundSeatId",
      rs.seat_no as "seatNo",
      rs.user_id as "userId",
      rs.status as "roundSeatStatus",
      rs.total_wager_amount as "totalWagerAmount",
      h.id as "handId",
      h.status as "handStatus",
      h.initial_bet_amount as "initialBetAmount",
      h.final_bet_amount as "finalBetAmount",
      h.is_doubled as "isDoubled"
    from blackjack_rounds r
    inner join blackjack_tables t on t.id = r.table_id
    inner join blackjack_round_seats rs on rs.round_id = r.id
    inner join blackjack_hands h on h.round_seat_id = rs.id
    where r.id = ${input.roundId}
      and rs.id = ${input.roundSeatId}
      and h.hand_no = 1
    for update of r, rs, h
  `);
  const [row] = getRows<LockedDoubleDownContextRow>(result);

  if (!row) {
    throw new BlackjackBettingError(
      "ROUND_SEAT_NOT_FOUND",
      `Round seat ${input.roundSeatId} was not found for double down.`,
    );
  }

  if (row.userId !== input.userId || row.seatNo !== input.seatNo) {
    throw new BlackjackBettingError(
      "IDEMPOTENCY_CONFLICT",
      `Round seat ${input.roundSeatId} does not match the double down payload.`,
    );
  }

  return {
    ...row,
    tableMaxTotalBetPerSeat: toBigInt(row.tableMaxTotalBetPerSeat),
    tableMaxTotalBetPerUser: toBigInt(row.tableMaxTotalBetPerUser),
    totalWagerAmount: toBigInt(row.totalWagerAmount),
    initialBetAmount: toBigInt(row.initialBetAmount),
    finalBetAmount: toBigInt(row.finalBetAmount),
  };
}

function assertDoubleDownAllowed(context: LockedDoubleDownContext) {
  if (context.roundStatus === "SETTLED" || context.roundStatus === "CANCELLED") {
    throw new BlackjackBettingError(
      "ROUND_NOT_ACTIVE",
      `Round ${context.roundId} is ${context.roundStatus}.`,
    );
  }

  if (!context.ruleSnapshot.doubleAllowed) {
    throw new BlackjackBettingError(
      "ACTION_NOT_ALLOWED",
      `Double down is not allowed for round ${context.roundId}.`,
    );
  }

  if (
    context.roundSeatStatus !== "ACTIVE" ||
    context.handStatus !== "ACTIVE" ||
    context.isDoubled ||
    context.finalBetAmount !== context.initialBetAmount
  ) {
    throw new BlackjackBettingError(
      "ACTION_NOT_ALLOWED",
      `Round seat ${context.roundSeatId} cannot double down.`,
    );
  }
}

async function assertDoubleBetAmountAllowed(
  tx: WalletMutationTransaction,
  input: {
    context: LockedDoubleDownContext;
    userId: string;
    amount: bigint;
  },
) {
  if (
    input.context.totalWagerAmount + input.amount >
    input.context.tableMaxTotalBetPerSeat
  ) {
    throw new BlackjackBettingError(
      "BET_TOO_HIGH",
      `Total seat wager must not exceed ${input.context.tableMaxTotalBetPerSeat}.`,
    );
  }

  const totalWagerForUser = await getActiveRoundWagerForUser(
    tx,
    input.context.roundId,
    input.userId,
  );

  if (
    totalWagerForUser + input.amount >
    input.context.tableMaxTotalBetPerUser
  ) {
    throw new BlackjackBettingError(
      "BET_TOO_HIGH",
      `Total user wager must not exceed ${input.context.tableMaxTotalBetPerUser}.`,
    );
  }
}

async function lockSplitContext(
  tx: WalletMutationTransaction,
  input: SplitBlackjackBetInput,
): Promise<LockedSplitContext> {
  const result = await tx.execute(sql<LockedSplitContextRow>`
    select
      r.id as "roundId",
      r.status as "roundStatus",
      r.rule_snapshot as "ruleSnapshot",
      t.max_total_bet_per_seat as "tableMaxTotalBetPerSeat",
      t.max_total_bet_per_user as "tableMaxTotalBetPerUser",
      rs.id as "roundSeatId",
      rs.seat_no as "seatNo",
      rs.user_id as "userId",
      rs.status as "roundSeatStatus",
      rs.total_wager_amount as "totalWagerAmount",
      h.id as "sourceHandId",
      h.hand_no as "sourceHandNo",
      h.status as "sourceHandStatus",
      h.initial_bet_amount as "sourceHandInitialBetAmount",
      h.final_bet_amount as "sourceHandFinalBetAmount",
      h.is_doubled as "sourceHandIsDoubled",
      h.is_split_hand as "sourceHandIsSplitHand",
      (
        select count(*)::int
        from blackjack_hands all_hands
        where all_hands.round_seat_id = rs.id
      ) as "handCount",
      (
        select coalesce(max(all_hands.hand_no), 0)::int + 1
        from blackjack_hands all_hands
        where all_hands.round_seat_id = rs.id
      ) as "newHandNo"
    from blackjack_rounds r
    inner join blackjack_tables t on t.id = r.table_id
    inner join blackjack_round_seats rs on rs.round_id = r.id
    inner join blackjack_hands h on h.round_seat_id = rs.id
    where r.id = ${input.roundId}
      and rs.id = ${input.roundSeatId}
      and h.hand_no = ${input.sourceHandNo}
    for update of r, rs, h
  `);
  const [row] = getRows<LockedSplitContextRow>(result);

  if (!row) {
    throw new BlackjackBettingError(
      "ROUND_SEAT_NOT_FOUND",
      `Round seat ${input.roundSeatId} was not found for split.`,
    );
  }

  if (row.userId !== input.userId || row.seatNo !== input.seatNo) {
    throw new BlackjackBettingError(
      "IDEMPOTENCY_CONFLICT",
      `Round seat ${input.roundSeatId} does not match the split payload.`,
    );
  }

  return {
    ...row,
    tableMaxTotalBetPerSeat: toBigInt(row.tableMaxTotalBetPerSeat),
    tableMaxTotalBetPerUser: toBigInt(row.tableMaxTotalBetPerUser),
    totalWagerAmount: toBigInt(row.totalWagerAmount),
    sourceHandInitialBetAmount: toBigInt(row.sourceHandInitialBetAmount),
    sourceHandFinalBetAmount: toBigInt(row.sourceHandFinalBetAmount),
  };
}

function assertSplitAllowed(context: LockedSplitContext) {
  if (context.roundStatus === "SETTLED" || context.roundStatus === "CANCELLED") {
    throw new BlackjackBettingError(
      "ROUND_NOT_ACTIVE",
      `Round ${context.roundId} is ${context.roundStatus}.`,
    );
  }

  if (!context.ruleSnapshot.splitAllowed) {
    throw new BlackjackBettingError(
      "ACTION_NOT_ALLOWED",
      `Split is not allowed for round ${context.roundId}.`,
    );
  }

  if (
    context.roundSeatStatus !== "ACTIVE" ||
    context.sourceHandStatus !== "ACTIVE" ||
    context.sourceHandIsDoubled ||
    context.sourceHandFinalBetAmount !== context.sourceHandInitialBetAmount
  ) {
    throw new BlackjackBettingError(
      "ACTION_NOT_ALLOWED",
      `Hand ${context.sourceHandNo} cannot be split.`,
    );
  }

  if (
    context.handCount >= context.ruleSnapshot.maxSplitHands ||
    context.newHandNo > context.ruleSnapshot.maxSplitHands
  ) {
    throw new BlackjackBettingError(
      "ACTION_NOT_ALLOWED",
      `Round seat ${context.roundSeatId} has reached the split hand limit.`,
    );
  }
}

async function assertSplitBetAmountAllowed(
  tx: WalletMutationTransaction,
  input: {
    context: LockedSplitContext;
    userId: string;
    amount: bigint;
  },
) {
  if (
    input.context.totalWagerAmount + input.amount >
    input.context.tableMaxTotalBetPerSeat
  ) {
    throw new BlackjackBettingError(
      "BET_TOO_HIGH",
      `Total seat wager must not exceed ${input.context.tableMaxTotalBetPerSeat}.`,
    );
  }

  const totalWagerForUser = await getActiveRoundWagerForUser(
    tx,
    input.context.roundId,
    input.userId,
  );

  if (
    totalWagerForUser + input.amount >
    input.context.tableMaxTotalBetPerUser
  ) {
    throw new BlackjackBettingError(
      "BET_TOO_HIGH",
      `Total user wager must not exceed ${input.context.tableMaxTotalBetPerUser}.`,
    );
  }
}

async function lockInsuranceContext(
  tx: WalletMutationTransaction,
  input: PlaceBlackjackInsuranceBetInput,
): Promise<LockedInsuranceContext> {
  const result = await tx.execute(sql<LockedInsuranceContextRow>`
    select
      r.id as "roundId",
      r.status as "roundStatus",
      r.rule_snapshot as "ruleSnapshot",
      rs.id as "roundSeatId",
      rs.seat_no as "seatNo",
      rs.user_id as "userId",
      rs.status as "roundSeatStatus",
      h.id as "handId",
      h.status as "handStatus",
      h.initial_bet_amount as "initialBetAmount"
    from blackjack_rounds r
    inner join blackjack_round_seats rs on rs.round_id = r.id
    inner join blackjack_hands h on h.round_seat_id = rs.id
    where r.id = ${input.roundId}
      and rs.id = ${input.roundSeatId}
      and h.hand_no = 1
    for update of r, rs, h
  `);
  const [row] = getRows<LockedInsuranceContextRow>(result);

  if (!row) {
    throw new BlackjackBettingError(
      "ROUND_SEAT_NOT_FOUND",
      `Round seat ${input.roundSeatId} was not found for insurance.`,
    );
  }

  if (row.userId !== input.userId || row.seatNo !== input.seatNo) {
    throw new BlackjackBettingError(
      "IDEMPOTENCY_CONFLICT",
      `Round seat ${input.roundSeatId} does not match the insurance payload.`,
    );
  }

  return {
    ...row,
    initialBetAmount: toBigInt(row.initialBetAmount),
  };
}

function assertInsuranceAllowed(context: LockedInsuranceContext, amount: bigint) {
  if (context.roundStatus === "SETTLED" || context.roundStatus === "CANCELLED") {
    throw new BlackjackBettingError(
      "ROUND_NOT_ACTIVE",
      `Round ${context.roundId} is ${context.roundStatus}.`,
    );
  }

  if (!context.ruleSnapshot.insuranceAllowed) {
    throw new BlackjackBettingError(
      "ACTION_NOT_ALLOWED",
      `Insurance is not allowed for round ${context.roundId}.`,
    );
  }

  if (
    context.roundSeatStatus !== "ACTIVE" ||
    (context.handStatus !== "ACTIVE" && context.handStatus !== "SETTLED")
  ) {
    throw new BlackjackBettingError(
      "ACTION_NOT_ALLOWED",
      `Round seat ${context.roundSeatId} cannot place insurance.`,
    );
  }

  if (amount <= zero) {
    throw new BlackjackBettingError(
      "INVALID_BET_AMOUNT",
      "Insurance amount must be positive.",
    );
  }
}

async function findBetActionByCommandId(
  tx: WalletMutationTransaction,
  roundId: string,
  commandId: string,
) {
  const [action] = await tx
    .select()
    .from(blackjackActions)
    .where(
      and(
        eq(blackjackActions.roundId, roundId),
        eq(blackjackActions.commandId, commandId),
      ),
    )
    .limit(1);

  return action ?? null;
}

async function findRoundSeatById(
  tx: WalletMutationTransaction,
  roundSeatId: string | null,
) {
  if (!roundSeatId) {
    throw new BlackjackBettingError(
      "IDEMPOTENCY_CONFLICT",
      "Existing bet action is missing a round seat reference.",
    );
  }

  const [roundSeat] = await tx
    .select()
    .from(blackjackRoundSeats)
    .where(eq(blackjackRoundSeats.id, roundSeatId))
    .limit(1);

  if (!roundSeat) {
    throw new BlackjackBettingError(
      "IDEMPOTENCY_CONFLICT",
      `Round seat ${roundSeatId} was not found for an existing bet action.`,
    );
  }

  return roundSeat;
}

async function calculateMaxInitialBet(
  tx: WalletMutationTransaction,
  userId: string,
  table: BlackjackRuntimeTable,
) {
  const wallet = await getActiveWalletForUpdate(tx, userId);

  return calculateMaxInitialBetFromBalance(
    wallet.balance - wallet.lockedBalance,
    table,
  );
}

function calculateMaxInitialBetFromBalance(
  availableBalance: bigint,
  table: BlackjackRuntimeTable,
) {
  const walletCap = availableBalance / ten;

  return walletCap < table.maxInitialBet ? walletCap : table.maxInitialBet;
}

async function nextRoundNo(tx: WalletMutationTransaction, tableId: string) {
  const result = await tx.execute(sql<{ roundNo: number }>`
    select coalesce(max(round_no), 0) + 1 as "roundNo"
    from blackjack_rounds
    where table_id = ${tableId}
  `);
  const [row] = getRows<{ roundNo: number }>(result);

  return Number(row?.roundNo ?? 1);
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

function buildBetWalletMutationInput(
  input: PlaceBlackjackInitialBetInput,
  roundId: string,
  roundSeatId: string,
) {
  return {
    userId: input.userId,
    category: "GAME" as const,
    gameType: "BLACKJACK" as const,
    type: "BET" as const,
    delta: -input.amount,
    referenceType: "BLACKJACK_ROUND",
    referenceId: roundId,
    idempotencyKey: `blackjack:bet:${roundId}:${input.userId}:${input.commandId}`,
    memo: `Blackjack initial bet for seat ${input.seatNo}`,
    metadata: {
      tableCode: input.tableCode,
      seatNo: input.seatNo,
      roundSeatId,
      commandId: input.commandId,
    } satisfies JsonObject,
  };
}

function buildDoubleWalletMutationInput(
  input: DoubleBlackjackBetInput,
  amount: bigint,
) {
  return {
    userId: input.userId,
    category: "GAME" as const,
    gameType: "BLACKJACK" as const,
    type: "DOUBLE_BET" as const,
    delta: -amount,
    referenceType: "BLACKJACK_ROUND",
    referenceId: input.roundId,
    idempotencyKey: `blackjack:double:${input.roundId}:${input.roundSeatId}:${input.userId}:${input.commandId}`,
    memo: `Blackjack double down for seat ${input.seatNo}`,
    metadata: {
      seatNo: input.seatNo,
      roundSeatId: input.roundSeatId,
      commandId: input.commandId,
    } satisfies JsonObject,
  };
}

function buildSplitWalletMutationInput(
  input: SplitBlackjackBetInput,
  amount: bigint,
) {
  return {
    userId: input.userId,
    category: "GAME" as const,
    gameType: "BLACKJACK" as const,
    type: "SPLIT_BET" as const,
    delta: -amount,
    referenceType: "BLACKJACK_ROUND",
    referenceId: input.roundId,
    idempotencyKey: `blackjack:split:${input.roundId}:${input.roundSeatId}:${input.sourceHandNo}:${input.userId}:${input.commandId}`,
    memo: `Blackjack split for seat ${input.seatNo} hand ${input.sourceHandNo}`,
    metadata: {
      seatNo: input.seatNo,
      roundSeatId: input.roundSeatId,
      sourceHandNo: input.sourceHandNo,
      commandId: input.commandId,
    } satisfies JsonObject,
  };
}

function buildInsuranceWalletMutationInput(
  input: PlaceBlackjackInsuranceBetInput,
  amount: bigint,
) {
  return {
    userId: input.userId,
    category: "GAME" as const,
    gameType: "BLACKJACK" as const,
    type: "INSURANCE_BET" as const,
    delta: -amount,
    referenceType: "BLACKJACK_ROUND",
    referenceId: input.roundId,
    idempotencyKey: `blackjack:insurance:${input.roundId}:${input.roundSeatId}:${input.userId}:${input.commandId}`,
    memo: `Blackjack insurance for seat ${input.seatNo}`,
    metadata: {
      seatNo: input.seatNo,
      roundSeatId: input.roundSeatId,
      commandId: input.commandId,
    } satisfies JsonObject,
  };
}

function assertExistingBetActionMatches(
  action: typeof blackjackActions.$inferSelect,
  roundSeat: typeof blackjackRoundSeats.$inferSelect,
  input: PlaceBlackjackInitialBetInput,
) {
  const mismatched =
    action.actionType !== "PLACE_BET" ||
    action.userId !== input.userId ||
    action.amount !== input.amount ||
    roundSeat.userId !== input.userId ||
    roundSeat.seatNo !== input.seatNo ||
    roundSeat.initialBetAmount !== input.amount ||
    roundSeat.totalWagerAmount !== input.amount;

  if (mismatched) {
    throw new BlackjackBettingError(
      "IDEMPOTENCY_CONFLICT",
      `Command ${input.commandId} was reused with different bet details.`,
    );
  }
}

function assertExistingDoubleActionMatches(
  action: typeof blackjackActions.$inferSelect,
  context: LockedDoubleDownContext,
  input: DoubleBlackjackBetInput,
) {
  const mismatched =
    action.actionType !== "DOUBLE" ||
    action.userId !== input.userId ||
    action.roundSeatId !== input.roundSeatId ||
    action.handId !== context.handId ||
    action.amount !== context.initialBetAmount ||
    context.userId !== input.userId ||
    context.seatNo !== input.seatNo ||
    !context.isDoubled ||
    context.finalBetAmount !== context.initialBetAmount * BigInt(2);

  if (mismatched) {
    throw new BlackjackBettingError(
      "IDEMPOTENCY_CONFLICT",
      `Command ${input.commandId} was reused with different double down details.`,
    );
  }
}

function assertExistingSplitActionMatches(
  action: typeof blackjackActions.$inferSelect,
  context: LockedSplitContext,
  input: SplitBlackjackBetInput,
) {
  const newHandNo = readNumberPayloadValue(action.payload, "newHandNo");
  const sourceHandNo = readNumberPayloadValue(action.payload, "sourceHandNo");
  const mismatched =
    action.actionType !== "SPLIT" ||
    action.userId !== input.userId ||
    action.roundSeatId !== input.roundSeatId ||
    action.handId !== context.sourceHandId ||
    action.amount !== context.sourceHandInitialBetAmount ||
    context.userId !== input.userId ||
    context.seatNo !== input.seatNo ||
    !context.sourceHandIsSplitHand ||
    sourceHandNo !== input.sourceHandNo ||
    newHandNo === null ||
    newHandNo < 1 ||
    newHandNo > context.ruleSnapshot.maxSplitHands;

  if (mismatched) {
    throw new BlackjackBettingError(
      "IDEMPOTENCY_CONFLICT",
      `Command ${input.commandId} was reused with different split details.`,
    );
  }

  return newHandNo;
}

function assertExistingInsuranceActionMatches(
  action: typeof blackjackActions.$inferSelect,
  context: LockedInsuranceContext,
  input: PlaceBlackjackInsuranceBetInput,
  amount: bigint,
) {
  const mismatched =
    action.actionType !== "INSURANCE_ACCEPT" ||
    action.userId !== input.userId ||
    action.roundSeatId !== input.roundSeatId ||
    action.handId !== context.handId ||
    action.amount !== amount ||
    context.userId !== input.userId ||
    context.seatNo !== input.seatNo;

  if (mismatched) {
    throw new BlackjackBettingError(
      "IDEMPOTENCY_CONFLICT",
      `Command ${input.commandId} was reused with different insurance details.`,
    );
  }
}

function buildServerCommandId(input: { userId: string; commandId: string }) {
  return `${input.userId}:${input.commandId}`;
}

function normalizeInitialBetInput(
  input: PlaceBlackjackInitialBetInput,
): PlaceBlackjackInitialBetInput {
  const tableCode = input.tableCode.trim();
  const userId = input.userId.trim();
  const commandId = input.commandId.trim();

  if (!tableCode) {
    throw new BlackjackBettingError(
      "INVALID_TABLE_ID",
      "tableCode is required.",
    );
  }

  if (!Number.isInteger(input.seatNo) || input.seatNo < 1 || input.seatNo > 7) {
    throw new BlackjackBettingError(
      "INVALID_SEAT_NO",
      "seatNo must be an integer between 1 and 7.",
    );
  }

  if (!userId) {
    throw new BlackjackBettingError(
      "IDEMPOTENCY_CONFLICT",
      "userId is required for blackjack bets.",
    );
  }

  if (!commandId) {
    throw new BlackjackBettingError(
      "INVALID_COMMAND_ID",
      "commandId is required for blackjack bets.",
    );
  }

  if (input.amount <= zero) {
    throw new BlackjackBettingError(
      "INVALID_BET_AMOUNT",
      "Bet amount must be positive.",
    );
  }

  return {
    tableCode,
    seatNo: input.seatNo,
    userId,
    amount: input.amount,
    commandId,
  };
}

function normalizeDoubleBetInput(
  input: DoubleBlackjackBetInput,
): DoubleBlackjackBetInput {
  const roundId = input.roundId.trim();
  const roundSeatId = input.roundSeatId.trim();
  const userId = input.userId.trim();
  const commandId = input.commandId.trim();

  if (!roundId) {
    throw new BlackjackBettingError(
      "ROUND_NOT_ACTIVE",
      "roundId is required for double down.",
    );
  }

  if (!roundSeatId) {
    throw new BlackjackBettingError(
      "ROUND_SEAT_NOT_FOUND",
      "roundSeatId is required for double down.",
    );
  }

  if (!Number.isInteger(input.seatNo) || input.seatNo < 1 || input.seatNo > 7) {
    throw new BlackjackBettingError(
      "INVALID_SEAT_NO",
      "seatNo must be an integer between 1 and 7.",
    );
  }

  if (!userId) {
    throw new BlackjackBettingError(
      "IDEMPOTENCY_CONFLICT",
      "userId is required for double down.",
    );
  }

  if (!commandId) {
    throw new BlackjackBettingError(
      "INVALID_COMMAND_ID",
      "commandId is required for double down.",
    );
  }

  return {
    roundId,
    roundSeatId,
    seatNo: input.seatNo,
    userId,
    commandId,
  };
}

function normalizeSplitBetInput(
  input: SplitBlackjackBetInput,
): SplitBlackjackBetInput {
  const roundId = input.roundId.trim();
  const roundSeatId = input.roundSeatId.trim();
  const userId = input.userId.trim();
  const commandId = input.commandId.trim();

  if (!roundId) {
    throw new BlackjackBettingError(
      "ROUND_NOT_ACTIVE",
      "roundId is required for split.",
    );
  }

  if (!roundSeatId) {
    throw new BlackjackBettingError(
      "ROUND_SEAT_NOT_FOUND",
      "roundSeatId is required for split.",
    );
  }

  if (!Number.isInteger(input.seatNo) || input.seatNo < 1 || input.seatNo > 7) {
    throw new BlackjackBettingError(
      "INVALID_SEAT_NO",
      "seatNo must be an integer between 1 and 7.",
    );
  }

  if (
    !Number.isInteger(input.sourceHandNo) ||
    input.sourceHandNo < 1 ||
    input.sourceHandNo > 4
  ) {
    throw new BlackjackBettingError(
      "ACTION_NOT_ALLOWED",
      "sourceHandNo must be an integer between 1 and 4.",
    );
  }

  if (!userId) {
    throw new BlackjackBettingError(
      "IDEMPOTENCY_CONFLICT",
      "userId is required for split.",
    );
  }

  if (!commandId) {
    throw new BlackjackBettingError(
      "INVALID_COMMAND_ID",
      "commandId is required for split.",
    );
  }

  return {
    roundId,
    roundSeatId,
    seatNo: input.seatNo,
    sourceHandNo: input.sourceHandNo,
    userId,
    commandId,
  };
}

function normalizeInsuranceBetInput(
  input: PlaceBlackjackInsuranceBetInput,
): PlaceBlackjackInsuranceBetInput {
  const roundId = input.roundId.trim();
  const roundSeatId = input.roundSeatId.trim();
  const userId = input.userId.trim();
  const commandId = input.commandId.trim();

  if (!roundId) {
    throw new BlackjackBettingError(
      "ROUND_NOT_ACTIVE",
      "roundId is required for insurance.",
    );
  }

  if (!roundSeatId) {
    throw new BlackjackBettingError(
      "ROUND_SEAT_NOT_FOUND",
      "roundSeatId is required for insurance.",
    );
  }

  if (!Number.isInteger(input.seatNo) || input.seatNo < 1 || input.seatNo > 7) {
    throw new BlackjackBettingError(
      "INVALID_SEAT_NO",
      "seatNo must be an integer between 1 and 7.",
    );
  }

  if (!userId) {
    throw new BlackjackBettingError(
      "IDEMPOTENCY_CONFLICT",
      "userId is required for insurance.",
    );
  }

  if (!commandId) {
    throw new BlackjackBettingError(
      "INVALID_COMMAND_ID",
      "commandId is required for insurance.",
    );
  }

  return {
    roundId,
    roundSeatId,
    seatNo: input.seatNo,
    userId,
    commandId,
  };
}

function toRuntimeTable(
  table: typeof blackjackTables.$inferSelect | LockedBlackjackTableRow,
): BlackjackRuntimeTable {
  return {
    id: table.id,
    code: table.code,
    name: table.name,
    status: toTableStatus(table.status),
    minInitialBet: toBigInt(table.minInitialBet),
    maxInitialBet: toBigInt(table.maxInitialBet),
    maxTotalBetPerSeat: toBigInt(table.maxTotalBetPerSeat),
    maxTotalBetPerUser: toBigInt(table.maxTotalBetPerUser),
    maxSeats: table.maxSeats,
    maxSeatsPerUser: table.maxSeatsPerUser,
    bettingTimeoutSeconds: table.bettingTimeoutSeconds,
    actionTimeoutSeconds: table.actionTimeoutSeconds,
    deckCount: table.deckCount,
    shoePenetrationPercent: table.shoePenetrationPercent,
    dealerHitsSoft17: table.dealerHitsSoft17,
    blackjackPayoutNumerator: table.blackjackPayoutNumerator,
    blackjackPayoutDenominator: table.blackjackPayoutDenominator,
    insuranceAllowed: table.insuranceAllowed,
    evenMoneyAllowed: table.evenMoneyAllowed,
    surrenderMode: toSurrenderMode(table.surrenderMode),
    doubleAllowed: table.doubleAllowed,
    doubleAfterSplitAllowed: table.doubleAfterSplitAllowed,
    splitAllowed: table.splitAllowed,
    maxSplitHands: table.maxSplitHands,
    resplitAcesAllowed: table.resplitAcesAllowed,
    hitSplitAcesAllowed: table.hitSplitAcesAllowed,
    dealerPeekEnabled: table.dealerPeekEnabled,
    cardCountingMode: toCardCountingMode(table.cardCountingMode),
  };
}

function buildRuleSnapshot(
  table: BlackjackRuntimeTable,
): BlackjackRuleSnapshot {
  return {
    deckCount: table.deckCount,
    dealerHitsSoft17: table.dealerHitsSoft17,
    blackjackPayout: {
      numerator: table.blackjackPayoutNumerator,
      denominator: table.blackjackPayoutDenominator,
    },
    insuranceAllowed: table.insuranceAllowed,
    evenMoneyAllowed: table.evenMoneyAllowed,
    surrenderMode: table.surrenderMode,
    doubleAllowed: table.doubleAllowed,
    doubleAfterSplitAllowed: table.doubleAfterSplitAllowed,
    splitAllowed: table.splitAllowed,
    maxSplitHands: table.maxSplitHands,
    resplitAcesAllowed: table.resplitAcesAllowed,
    hitSplitAcesAllowed: table.hitSplitAcesAllowed,
    dealerPeekEnabled: table.dealerPeekEnabled,
    cardCountingMode: table.cardCountingMode,
  };
}

function toTableStatus(status: string): BlackjackRuntimeTable["status"] {
  if (status === "OPEN" || status === "MAINTENANCE" || status === "CLOSED") {
    return status;
  }

  throw new BlackjackBettingError(
    "TABLE_NOT_OPEN",
    `Unsupported blackjack table status ${status}.`,
  );
}

function toSurrenderMode(
  status: string,
): BlackjackRuleSnapshot["surrenderMode"] {
  if (status === "NONE" || status === "LATE" || status === "EARLY") {
    return status;
  }

  return "LATE";
}

function toCardCountingMode(
  mode: string,
): BlackjackRuleSnapshot["cardCountingMode"] {
  if (
    mode === "DISABLED" ||
    mode === "INTERNAL_ANALYTICS" ||
    mode === "TRAINER_VISIBLE"
  ) {
    return mode;
  }

  return "INTERNAL_ANALYTICS";
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

function toBigInt(value: bigint | string) {
  return typeof value === "bigint" ? value : BigInt(value);
}

function readNumberPayloadValue(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];

  return typeof value === "number" && Number.isInteger(value) ? value : null;
}
