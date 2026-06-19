import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "./client.js";
import {
  racingActions,
  racingBets,
  racingBetSelections,
  racingRaceEntries,
  racingRaces,
  type JsonObject,
} from "./schema.js";
import {
  applyWalletMutationInTransaction,
  getActiveWalletForUpdate,
  type WalletMutationResult,
  type WalletMutationTransaction,
} from "./wallet-transactions.js";

export type RacingBetType =
  | "WIN"
  | "PLACE"
  | "QUINELLA"
  | "EXACTA"
  | "QUINELLA_PLACE"
  | "TRIO"
  | "TRIFECTA";

const racingBetTypes = new Set<RacingBetType>([
  "WIN",
  "PLACE",
  "QUINELLA",
  "EXACTA",
  "QUINELLA_PLACE",
  "TRIO",
  "TRIFECTA",
]);
const unorderedRacingBetTypes = new Set<RacingBetType>([
  "QUINELLA",
  "QUINELLA_PLACE",
  "TRIO",
]);
const zero = BigInt(0);
const racingOddsDenominator = 10_000;

export type RacingBettingErrorCode =
  | "RACE_NOT_FOUND"
  | "RACE_ENTRY_NOT_FOUND"
  | "TABLE_NOT_OPEN"
  | "BETTING_CLOSED"
  | "INVALID_BET"
  | "BET_TOO_LOW"
  | "BET_TOO_HIGH"
  | "BET_ALREADY_PLACED"
  | "IDEMPOTENCY_CONFLICT";

export class RacingBettingError extends Error {
  readonly code: RacingBettingErrorCode;

  constructor(code: RacingBettingErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "RacingBettingError";
  }
}

export type RacingSettlementErrorCode =
  | "RACE_NOT_FOUND"
  | "INVALID_SETTLEMENT"
  | "SETTLEMENT_CONFLICT"
  | "INVALID_CANCEL";

export class RacingSettlementError extends Error {
  readonly code: RacingSettlementErrorCode;

  constructor(code: RacingSettlementErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "RacingSettlementError";
  }
}

export type PlaceRacingBetInput = {
  raceId: string;
  userId: string;
  amount: bigint;
  commandId: string;
  betType: RacingBetType;
  selections: string[];
};

export type PlaceRacingWinBetInput = {
  raceId: string;
  raceEntryId: string;
  userId: string;
  amount: bigint;
  commandId: string;
};

export type PlaceRacingBetResult = {
  race: RacingRaceSnapshot;
  table: RacingTableSnapshot;
  bet: typeof racingBets.$inferSelect;
  selections: RacingBetSelectionSnapshot[];
  walletMutation: WalletMutationResult;
};

export type PlaceRacingWinBetResult = PlaceRacingBetResult & {
  raceEntry: RacingRaceEntrySnapshot;
};

export type SettleRacingRaceInput = {
  raceId: string;
  entries: SettleRacingRaceEntryInput[];
};

export type SettleRacingRaceEntryInput = {
  raceEntryId: string;
  finalRank: number;
  finishedAtMs: number;
};

export type SettleRacingRaceResult = {
  raceId: string;
  resultOrder: string[];
  bets: SettleRacingBetResult[];
};

export type SettleRacingBetResult = {
  betId: string;
  userId: string;
  betType: RacingBetType;
  selections: RacingBetSelectionSnapshot[];
  outcome: "WIN" | "LOSE";
  payoutAmount: bigint;
  netAmount: bigint;
  walletMutation: WalletMutationResult | null;
};

export type CancelRacingRaceInput = {
  raceId: string;
  reason: string;
};

export type CancelRacingRaceResult = {
  raceId: string;
  bets: CancelRacingBetResult[];
};

export type CancelRacingBetResult = {
  betId: string;
  userId: string;
  betType: RacingBetType;
  selections: RacingBetSelectionSnapshot[];
  refundAmount: bigint;
  walletMutation: WalletMutationResult;
};

export type RacingTableSnapshot = {
  id: string;
  code: string;
  status: "OPEN" | "MAINTENANCE" | "CLOSED";
  minBet: bigint;
  maxBet: bigint;
  payoutRateBps: number;
  bettingTimeoutSeconds: number;
  raceIntervalSeconds: number;
  bettingCloseBeforeStartSeconds: number;
};

export type RacingRaceSnapshot = {
  id: string;
  tableId: string;
  status: string;
  phase: string;
  fieldSize: number;
  scheduledStartAt: Date | null;
  bettingOpensAt: Date | null;
  bettingClosesAt: Date | null;
};

export type RacingRaceEntrySnapshot = {
  id: string;
  raceId: string;
  horseId: string;
  number: number;
};

export type RacingBetSelectionSnapshot = {
  raceEntryId: string;
  horseId: string;
  selectionOrder: number;
  expectedRank: number | null;
};

type LockedRacingBettingContext = {
  table: RacingTableSnapshot;
  race: RacingRaceSnapshot;
};

type LockedRacingBettingContextRow = {
  tableId: string;
  tableCode: string;
  tableStatus: string;
  minBet: bigint | string;
  maxBet: bigint | string;
  payoutRateBps: number;
  bettingTimeoutSeconds: number;
  raceIntervalSeconds: number;
  bettingCloseBeforeStartSeconds: number;
  raceId: string;
  raceStatus: string;
  racePhase: string;
  fieldSize: number;
  scheduledStartAt: Date | null;
  bettingOpensAt: Date | null;
  bettingClosesAt: Date | null;
};

type LockedRacingRaceRow = {
  id: string;
  tableId: string;
  status: string;
  phase: string;
  fieldSize: number;
  resultOrder: string[] | null;
};

export async function placeRacingBet(
  input: PlaceRacingBetInput,
): Promise<PlaceRacingBetResult> {
  const normalizedInput = normalizePlaceRacingBetInput(input);

  return db.transaction((tx) =>
    placeRacingBetInTransaction(tx, normalizedInput),
  );
}

export async function placeRacingWinBet(
  input: PlaceRacingWinBetInput,
): Promise<PlaceRacingWinBetResult> {
  const result = await placeRacingBet({
    raceId: input.raceId,
    userId: input.userId,
    amount: input.amount,
    commandId: input.commandId,
    betType: "WIN",
    selections: [input.raceEntryId],
  });
  const selection = result.selections[0];

  if (!selection) {
    throw new RacingBettingError(
      "INVALID_BET",
      "Win bet did not return a selected race entry.",
    );
  }

  return {
    ...result,
    raceEntry: {
      id: selection.raceEntryId,
      raceId: result.race.id,
      horseId: selection.horseId,
      number: 1,
    },
  };
}

export async function placeRacingBetInTransaction(
  tx: WalletMutationTransaction,
  input: PlaceRacingBetInput,
): Promise<PlaceRacingBetResult> {
  const context = await lockRacingBettingContext(tx, input.raceId);

  assertRaceAcceptsBets(context, new Date());

  const entries = await findSelectedRaceEntries(
    tx,
    context.race.id,
    input.selections,
  );
  const selections = normalizeBetSelections(
    input.betType,
    input.selections,
    entries,
  );
  const oddsNumerator = calculateOddsNumerator(context, input.betType);
  const existingBet = await findRacingBetByCommand(
    tx,
    input.raceId,
    input.userId,
    input.commandId,
  );

  if (existingBet) {
    await assertExistingRacingBetMatches(
      tx,
      existingBet,
      input,
      context,
      selections,
      oddsNumerator,
    );

    return {
      race: context.race,
      table: context.table,
      bet: existingBet,
      selections: await findRacingBetSelectionsByBetId(tx, existingBet.id),
      walletMutation: await applyWalletMutationInTransaction(
        tx,
        buildBetWalletMutationInput(input, context, selections, oddsNumerator),
      ),
    };
  }

  const wallet = await getActiveWalletForUpdate(tx, input.userId);
  const maxBet = minBigInt(
    context.table.maxBet,
    wallet.balance - wallet.lockedBalance,
  );

  if (input.amount < context.table.minBet) {
    throw new RacingBettingError(
      "BET_TOO_LOW",
      `Bet amount must be at least ${context.table.minBet.toString()}.`,
    );
  }

  if (input.amount > maxBet) {
    throw new RacingBettingError(
      "BET_TOO_HIGH",
      `Bet amount must not exceed ${maxBet.toString()}.`,
    );
  }

  const primarySelection = selections[0];

  if (!primarySelection) {
    throw new RacingBettingError(
      "INVALID_BET",
      "At least one racing selection is required.",
    );
  }

  const walletMutation = await applyWalletMutationInTransaction(
    tx,
    buildBetWalletMutationInput(input, context, selections, oddsNumerator),
  );
  const now = new Date();
  const [insertedBet] = await tx
    .insert(racingBets)
    .values({
      raceId: context.race.id,
      tableId: context.table.id,
      raceEntryId: primarySelection.raceEntryId,
      horseId: primarySelection.horseId,
      userId: input.userId,
      betType: input.betType,
      status: "PLACED",
      amount: input.amount,
      oddsNumerator,
      oddsDenominator: racingOddsDenominator,
      payoutAmount: zero,
      netAmount: -input.amount,
      placedLedgerId: walletMutation.ledger.id,
      commandId: input.commandId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [racingBets.raceId, racingBets.userId, racingBets.commandId],
    })
    .returning();

  if (!insertedBet) {
    const concurrentBet = await findRacingBetByCommand(
      tx,
      input.raceId,
      input.userId,
      input.commandId,
    );

    if (!concurrentBet) {
      throw new RacingBettingError(
        "INVALID_BET",
        "Failed to insert racing bet.",
      );
    }

    await assertExistingRacingBetMatches(
      tx,
      concurrentBet,
      input,
      context,
      selections,
      oddsNumerator,
    );

    return {
      race: context.race,
      table: context.table,
      bet: concurrentBet,
      selections: await findRacingBetSelectionsByBetId(tx, concurrentBet.id),
      walletMutation,
    };
  }

  await tx.insert(racingBetSelections).values(
    selections.map((selection) => ({
      betId: insertedBet.id,
      raceId: context.race.id,
      raceEntryId: selection.raceEntryId,
      horseId: selection.horseId,
      selectionOrder: selection.selectionOrder,
      expectedRank: selection.expectedRank,
    })),
  );

  await insertRacingAction(tx, {
    raceId: context.race.id,
    betId: insertedBet.id,
    userId: input.userId,
    actorType: "PLAYER",
    actionType: "PLACE_BET",
    commandId: input.commandId,
    amount: input.amount,
    payload: {
      betType: input.betType,
      selections,
      oddsNumerator,
      oddsDenominator: racingOddsDenominator,
    },
  });

  return {
    race: context.race,
    table: context.table,
    bet: insertedBet,
    selections,
    walletMutation,
  };
}

export async function settleRacingRace(
  input: SettleRacingRaceInput,
): Promise<SettleRacingRaceResult> {
  const normalizedInput = normalizeSettleRacingRaceInput(input);

  return db.transaction((tx) =>
    settleRacingRaceInTransaction(tx, normalizedInput),
  );
}

export async function settleRacingRaceInTransaction(
  tx: WalletMutationTransaction,
  input: SettleRacingRaceInput,
): Promise<SettleRacingRaceResult> {
  const race = await lockRacingRace(tx, input.raceId);

  if (race.status === "SETTLED") {
    return readSettledRacingRaceResult(tx, input);
  }

  if (race.status === "CANCELLED") {
    throw new RacingSettlementError(
      "INVALID_SETTLEMENT",
      `Race ${input.raceId} is cancelled.`,
    );
  }

  if (!["RUNNING", "FINISHING", "SETTLING"].includes(race.phase)) {
    throw new RacingSettlementError(
      "INVALID_SETTLEMENT",
      `Race ${input.raceId} is not ready for settlement.`,
    );
  }

  const entries = await findRacingRaceEntries(tx, input.raceId);
  assertSettlementEntriesMatchRace(input, entries);

  const settledAt = new Date();
  const resultOrder = getResultOrder(input);
  const rankByRaceEntryId = getRankByRaceEntryId(input);

  for (const entryInput of input.entries) {
    await tx
      .update(racingRaceEntries)
      .set({
        finalRank: entryInput.finalRank,
        finishedAtMs: entryInput.finishedAtMs,
        updatedAt: settledAt,
      })
      .where(eq(racingRaceEntries.id, entryInput.raceEntryId));
  }

  const bets = await findRacingBetsByRace(tx, input.raceId);
  const selectionsByBetId = await findRacingBetSelectionsByBetIds(
    tx,
    bets.map((bet) => bet.id),
  );
  const betResults: SettleRacingBetResult[] = [];

  for (const bet of bets) {
    if (bet.status !== "PLACED") {
      throw new RacingSettlementError(
        "SETTLEMENT_CONFLICT",
        `Bet ${bet.id} is already ${bet.status}.`,
      );
    }

    const betType = parseRacingBetType(bet.betType);
    const selections = selectionsByBetId.get(bet.id) ?? [];
    const outcome = isWinningBet(
      betType,
      selections,
      rankByRaceEntryId,
      race.fieldSize,
    )
      ? "WIN"
      : "LOSE";
    const payoutAmount =
      outcome === "WIN" ? calculateBetPayoutAmount(bet) : zero;
    const netAmount = payoutAmount - bet.amount;
    const walletMutation =
      payoutAmount > zero
        ? await applyWalletMutationInTransaction(
            tx,
            buildSettlementWalletMutationInput(bet, payoutAmount, selections),
          )
        : null;

    await tx
      .update(racingBets)
      .set({
        status: outcome === "WIN" ? "WON" : "LOST",
        payoutAmount,
        netAmount,
        settlementLedgerId: walletMutation?.ledger.id ?? null,
        settledAt,
        updatedAt: settledAt,
      })
      .where(eq(racingBets.id, bet.id));

    await insertRacingAction(tx, {
      raceId: input.raceId,
      betId: bet.id,
      userId: bet.userId,
      actorType: "SYSTEM",
      actionType: "SETTLE",
      commandId: `settle:${bet.id}`,
      amount: payoutAmount,
      payload: {
        betType,
        selections,
        outcome,
        payoutAmount: payoutAmount.toString(),
        netAmount: netAmount.toString(),
      },
    });

    betResults.push({
      betId: bet.id,
      userId: bet.userId,
      betType,
      selections,
      outcome,
      payoutAmount,
      netAmount,
      walletMutation,
    });
  }

  await tx
    .update(racingRaces)
    .set({
      status: "SETTLED",
      phase: "SETTLED",
      resultOrder,
      finishedAt: settledAt,
      settledAt,
      updatedAt: settledAt,
    })
    .where(eq(racingRaces.id, input.raceId));

  await insertRacingAction(tx, {
    raceId: input.raceId,
    actorType: "SYSTEM",
    actionType: "FINISH",
    amount: zero,
    payload: {
      resultOrder,
    },
  });

  return {
    raceId: input.raceId,
    resultOrder,
    bets: betResults,
  };
}

export async function cancelRacingRace(
  input: CancelRacingRaceInput,
): Promise<CancelRacingRaceResult> {
  const normalizedInput = normalizeCancelRacingRaceInput(input);

  return db.transaction((tx) =>
    cancelRacingRaceInTransaction(tx, normalizedInput),
  );
}

export async function cancelRacingRaceInTransaction(
  tx: WalletMutationTransaction,
  input: CancelRacingRaceInput,
): Promise<CancelRacingRaceResult> {
  const race = await lockRacingRace(tx, input.raceId);

  if (race.status === "CANCELLED") {
    return readCancelledRacingRaceResult(tx, input);
  }

  if (race.status === "SETTLED") {
    throw new RacingSettlementError(
      "INVALID_CANCEL",
      `Race ${input.raceId} is already settled.`,
    );
  }

  const cancelledAt = new Date();
  const bets = await findRacingBetsByRace(tx, input.raceId);
  const selectionsByBetId = await findRacingBetSelectionsByBetIds(
    tx,
    bets.map((bet) => bet.id),
  );
  const betResults: CancelRacingBetResult[] = [];

  for (const bet of bets) {
    if (bet.status !== "PLACED") {
      throw new RacingSettlementError(
        "INVALID_CANCEL",
        `Bet ${bet.id} is already ${bet.status}.`,
      );
    }

    const betType = parseRacingBetType(bet.betType);
    const selections = selectionsByBetId.get(bet.id) ?? [];
    const walletMutation = await applyWalletMutationInTransaction(
      tx,
      buildCancelRefundWalletMutationInput(bet, input.reason, selections),
    );

    await tx
      .update(racingBets)
      .set({
        status: "CANCELLED",
        payoutAmount: bet.amount,
        netAmount: zero,
        settledAt: cancelledAt,
        updatedAt: cancelledAt,
      })
      .where(eq(racingBets.id, bet.id));

    await insertRacingAction(tx, {
      raceId: input.raceId,
      betId: bet.id,
      userId: bet.userId,
      actorType: "SYSTEM",
      actionType: "CANCEL",
      commandId: `cancel:${bet.id}`,
      amount: bet.amount,
      payload: {
        betType,
        reason: input.reason,
        selections,
        refundAmount: bet.amount.toString(),
      },
    });

    betResults.push({
      betId: bet.id,
      userId: bet.userId,
      betType,
      selections,
      refundAmount: bet.amount,
      walletMutation,
    });
  }

  await tx
    .update(racingRaces)
    .set({
      status: "CANCELLED",
      phase: "CANCELLED",
      cancelledAt,
      cancelReason: input.reason,
      updatedAt: cancelledAt,
    })
    .where(eq(racingRaces.id, input.raceId));

  return {
    raceId: input.raceId,
    bets: betResults,
  };
}

async function lockRacingBettingContext(
  tx: WalletMutationTransaction,
  raceId: string,
): Promise<LockedRacingBettingContext> {
  const result = await tx.execute(sql<LockedRacingBettingContextRow>`
    select
      rt.id as "tableId",
      rt.code as "tableCode",
      rt.status as "tableStatus",
      rt.min_bet as "minBet",
      rt.max_bet as "maxBet",
      rt.payout_rate_bps as "payoutRateBps",
      rt.betting_timeout_seconds as "bettingTimeoutSeconds",
      rt.race_interval_seconds as "raceIntervalSeconds",
      rt.betting_close_before_start_seconds as "bettingCloseBeforeStartSeconds",
      rr.id as "raceId",
      rr.status as "raceStatus",
      rr.phase as "racePhase",
      rr.field_size as "fieldSize",
      rr.scheduled_start_at as "scheduledStartAt",
      rr.betting_opens_at as "bettingOpensAt",
      rr.betting_closes_at as "bettingClosesAt"
    from racing_races rr
    inner join racing_tables rt on rt.id = rr.table_id
    where rr.id = ${raceId}
    for update of rr, rt
  `);
  const [row] = getRows<LockedRacingBettingContextRow>(result);

  if (!row) {
    throw new RacingBettingError(
      "RACE_NOT_FOUND",
      `Race ${raceId} was not found.`,
    );
  }

  return {
    table: {
      id: row.tableId,
      code: row.tableCode,
      status: parseRacingTableStatus(row.tableStatus),
      minBet: toBigInt(row.minBet),
      maxBet: toBigInt(row.maxBet),
      payoutRateBps: Number(row.payoutRateBps),
      bettingTimeoutSeconds: Number(row.bettingTimeoutSeconds),
      raceIntervalSeconds: Number(row.raceIntervalSeconds),
      bettingCloseBeforeStartSeconds: Number(
        row.bettingCloseBeforeStartSeconds,
      ),
    },
    race: {
      id: row.raceId,
      tableId: row.tableId,
      status: row.raceStatus,
      phase: row.racePhase,
      fieldSize: Number(row.fieldSize),
      scheduledStartAt: row.scheduledStartAt,
      bettingOpensAt: row.bettingOpensAt,
      bettingClosesAt: row.bettingClosesAt,
    },
  };
}

async function lockRacingRace(
  tx: WalletMutationTransaction,
  raceId: string,
): Promise<LockedRacingRaceRow> {
  const result = await tx.execute(sql<LockedRacingRaceRow>`
    select
      id,
      table_id as "tableId",
      status,
      phase,
      field_size as "fieldSize",
      result_order as "resultOrder"
    from racing_races
    where id = ${raceId}
    for update
  `);
  const [race] = getRows<LockedRacingRaceRow>(result);

  if (!race) {
    throw new RacingSettlementError(
      "RACE_NOT_FOUND",
      `Race ${raceId} was not found.`,
    );
  }

  return race;
}

async function findSelectedRaceEntries(
  tx: WalletMutationTransaction,
  raceId: string,
  raceEntryIds: string[],
): Promise<RacingRaceEntrySnapshot[]> {
  const entries = await tx
    .select({
      id: racingRaceEntries.id,
      raceId: racingRaceEntries.raceId,
      horseId: racingRaceEntries.horseId,
      number: racingRaceEntries.number,
    })
    .from(racingRaceEntries)
    .where(
      and(
        eq(racingRaceEntries.raceId, raceId),
        inArray(racingRaceEntries.id, raceEntryIds),
      ),
    );

  if (entries.length !== new Set(raceEntryIds).size) {
    throw new RacingBettingError(
      "RACE_ENTRY_NOT_FOUND",
      `One or more race entries were not found in race ${raceId}.`,
    );
  }

  return entries;
}

async function findRacingBetByCommand(
  tx: WalletMutationTransaction,
  raceId: string,
  userId: string,
  commandId: string,
) {
  const [bet] = await tx
    .select()
    .from(racingBets)
    .where(
      and(
        eq(racingBets.raceId, raceId),
        eq(racingBets.userId, userId),
        eq(racingBets.commandId, commandId),
      ),
    )
    .limit(1);

  return bet ?? null;
}

async function findRacingBetsByRace(
  tx: WalletMutationTransaction,
  raceId: string,
) {
  return tx.select().from(racingBets).where(eq(racingBets.raceId, raceId));
}

async function findRacingRaceEntries(
  tx: WalletMutationTransaction,
  raceId: string,
) {
  return tx
    .select()
    .from(racingRaceEntries)
    .where(eq(racingRaceEntries.raceId, raceId));
}

async function findRacingBetSelectionsByBetId(
  tx: WalletMutationTransaction,
  betId: string,
): Promise<RacingBetSelectionSnapshot[]> {
  const selections = await tx
    .select()
    .from(racingBetSelections)
    .where(eq(racingBetSelections.betId, betId))
    .orderBy(racingBetSelections.selectionOrder);

  return selections.map(toBetSelectionSnapshot);
}

async function findRacingBetSelectionsByBetIds(
  tx: WalletMutationTransaction,
  betIds: string[],
) {
  const map = new Map<string, RacingBetSelectionSnapshot[]>();

  if (betIds.length === 0) {
    return map;
  }

  const selections = await tx
    .select()
    .from(racingBetSelections)
    .where(inArray(racingBetSelections.betId, betIds))
    .orderBy(racingBetSelections.betId, racingBetSelections.selectionOrder);

  for (const selection of selections) {
    const list = map.get(selection.betId) ?? [];
    list.push(toBetSelectionSnapshot(selection));
    map.set(selection.betId, list);
  }

  return map;
}

async function readSettledRacingRaceResult(
  tx: WalletMutationTransaction,
  input: SettleRacingRaceInput,
): Promise<SettleRacingRaceResult> {
  const entries = await findRacingRaceEntries(tx, input.raceId);

  assertSettlementEntriesMatchRace(input, entries);

  for (const entryInput of input.entries) {
    const entry = entries.find(
      (candidate) => candidate.id === entryInput.raceEntryId,
    );

    if (
      entry?.finalRank !== entryInput.finalRank ||
      entry.finishedAtMs !== entryInput.finishedAtMs
    ) {
      throw new RacingSettlementError(
        "SETTLEMENT_CONFLICT",
        `Race entry ${entryInput.raceEntryId} is already settled with different results.`,
      );
    }
  }

  const resultOrder = getResultOrder(input);
  const rankByRaceEntryId = getRankByRaceEntryId(input);
  const bets = await findRacingBetsByRace(tx, input.raceId);
  const selectionsByBetId = await findRacingBetSelectionsByBetIds(
    tx,
    bets.map((bet) => bet.id),
  );
  const betResults: SettleRacingBetResult[] = [];

  for (const bet of bets) {
    const betType = parseRacingBetType(bet.betType);
    const selections = selectionsByBetId.get(bet.id) ?? [];
    const outcome = isWinningBet(
      betType,
      selections,
      rankByRaceEntryId,
      entries.length,
    )
      ? "WIN"
      : "LOSE";

    if (
      (outcome === "WIN" && bet.status !== "WON") ||
      (outcome === "LOSE" && bet.status !== "LOST")
    ) {
      throw new RacingSettlementError(
        "SETTLEMENT_CONFLICT",
        `Bet ${bet.id} is already settled with different results.`,
      );
    }

    const payoutAmount =
      outcome === "WIN" ? calculateBetPayoutAmount(bet) : zero;
    const netAmount = payoutAmount - bet.amount;
    const walletMutation =
      payoutAmount > zero
        ? await applyWalletMutationInTransaction(
            tx,
            buildSettlementWalletMutationInput(bet, payoutAmount, selections),
          )
        : null;

    betResults.push({
      betId: bet.id,
      userId: bet.userId,
      betType,
      selections,
      outcome,
      payoutAmount,
      netAmount,
      walletMutation,
    });
  }

  return {
    raceId: input.raceId,
    resultOrder,
    bets: betResults,
  };
}

async function readCancelledRacingRaceResult(
  tx: WalletMutationTransaction,
  input: CancelRacingRaceInput,
): Promise<CancelRacingRaceResult> {
  const bets = await findRacingBetsByRace(tx, input.raceId);
  const selectionsByBetId = await findRacingBetSelectionsByBetIds(
    tx,
    bets.map((bet) => bet.id),
  );
  const betResults: CancelRacingBetResult[] = [];

  for (const bet of bets) {
    if (bet.status !== "CANCELLED") {
      throw new RacingSettlementError(
        "INVALID_CANCEL",
        `Bet ${bet.id} is not cancelled.`,
      );
    }

    const betType = parseRacingBetType(bet.betType);
    const selections = selectionsByBetId.get(bet.id) ?? [];

    betResults.push({
      betId: bet.id,
      userId: bet.userId,
      betType,
      selections,
      refundAmount: bet.amount,
      walletMutation: await applyWalletMutationInTransaction(
        tx,
        buildCancelRefundWalletMutationInput(bet, input.reason, selections),
      ),
    });
  }

  return {
    raceId: input.raceId,
    bets: betResults,
  };
}

function assertRaceAcceptsBets(context: LockedRacingBettingContext, now: Date) {
  if (context.table.status !== "OPEN") {
    throw new RacingBettingError(
      "TABLE_NOT_OPEN",
      `Racing table ${context.table.code} is ${context.table.status}.`,
    );
  }

  if (context.race.status !== "BETTING" || context.race.phase !== "BETTING") {
    throw new RacingBettingError(
      "BETTING_CLOSED",
      `Race ${context.race.id} is not accepting bets.`,
    );
  }

  const bettingClosesAt = getBettingClosesAt(context);

  if (context.race.bettingOpensAt && now < context.race.bettingOpensAt) {
    throw new RacingBettingError(
      "BETTING_CLOSED",
      `Race ${context.race.id} betting opens at ${context.race.bettingOpensAt.toISOString()}.`,
    );
  }

  if (bettingClosesAt && now >= bettingClosesAt) {
    throw new RacingBettingError(
      "BETTING_CLOSED",
      `Race ${context.race.id} betting closed at ${bettingClosesAt.toISOString()}.`,
    );
  }
}

async function assertExistingRacingBetMatches(
  tx: WalletMutationTransaction,
  bet: typeof racingBets.$inferSelect,
  input: PlaceRacingBetInput,
  context: LockedRacingBettingContext,
  selections: RacingBetSelectionSnapshot[],
  oddsNumerator: number,
) {
  const existingSelections = await findRacingBetSelectionsByBetId(tx, bet.id);
  const mismatched =
    bet.betType !== input.betType ||
    bet.userId !== input.userId ||
    bet.raceId !== context.race.id ||
    bet.tableId !== context.table.id ||
    bet.amount !== input.amount ||
    bet.oddsNumerator !== oddsNumerator ||
    bet.oddsDenominator !== racingOddsDenominator ||
    !selectionsMatch(existingSelections, selections);

  if (mismatched) {
    throw new RacingBettingError(
      "IDEMPOTENCY_CONFLICT",
      `Command ${input.commandId} was reused with different racing bet details.`,
    );
  }
}

function assertSettlementEntriesMatchRace(
  input: SettleRacingRaceInput,
  entries: Array<typeof racingRaceEntries.$inferSelect>,
) {
  if (input.entries.length !== entries.length) {
    throw new RacingSettlementError(
      "INVALID_SETTLEMENT",
      `Race ${input.raceId} settlement must include all entries.`,
    );
  }

  const raceEntryIds = new Set(entries.map((entry) => entry.id));
  const seenRanks = new Set<number>();
  const seenEntryIds = new Set<string>();

  for (const entryInput of input.entries) {
    if (!raceEntryIds.has(entryInput.raceEntryId)) {
      throw new RacingSettlementError(
        "INVALID_SETTLEMENT",
        `Race entry ${entryInput.raceEntryId} does not belong to race ${input.raceId}.`,
      );
    }

    if (seenEntryIds.has(entryInput.raceEntryId)) {
      throw new RacingSettlementError(
        "INVALID_SETTLEMENT",
        `Race entry ${entryInput.raceEntryId} was included more than once.`,
      );
    }

    if (seenRanks.has(entryInput.finalRank)) {
      throw new RacingSettlementError(
        "INVALID_SETTLEMENT",
        `Final rank ${entryInput.finalRank} was included more than once.`,
      );
    }

    seenEntryIds.add(entryInput.raceEntryId);
    seenRanks.add(entryInput.finalRank);
  }

  for (let rank = 1; rank <= entries.length; rank += 1) {
    if (!seenRanks.has(rank)) {
      throw new RacingSettlementError(
        "INVALID_SETTLEMENT",
        `Final rank ${rank} is missing from settlement.`,
      );
    }
  }
}

function normalizeBetSelections(
  betType: RacingBetType,
  selectionIds: string[],
  entries: RacingRaceEntrySnapshot[],
): RacingBetSelectionSnapshot[] {
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const orderedEntries = selectionIds.map((selectionId) => {
    const entry = entriesById.get(selectionId);

    if (!entry) {
      throw new RacingBettingError(
        "RACE_ENTRY_NOT_FOUND",
        `Race entry ${selectionId} was not found.`,
      );
    }

    return entry;
  });
  const normalizedEntries = unorderedRacingBetTypes.has(betType)
    ? orderedEntries.slice().sort((left, right) => left.number - right.number)
    : orderedEntries;

  return normalizedEntries.map((entry, index) => ({
    raceEntryId: entry.id,
    horseId: entry.horseId,
    selectionOrder: index + 1,
    expectedRank: getExpectedRank(betType, index),
  }));
}

function getExpectedRank(betType: RacingBetType, index: number) {
  if (betType === "WIN") {
    return 1;
  }

  if (betType === "EXACTA" || betType === "TRIFECTA") {
    return index + 1;
  }

  return null;
}

function isWinningBet(
  betType: RacingBetType,
  selections: RacingBetSelectionSnapshot[],
  rankByRaceEntryId: Map<string, number>,
  fieldSize: number,
) {
  if (betType === "WIN") {
    return rankByRaceEntryId.get(selections[0]?.raceEntryId ?? "") === 1;
  }

  if (betType === "PLACE") {
    return (
      selections.length === 1 &&
      (rankByRaceEntryId.get(selections[0]?.raceEntryId ?? "") ??
        Number.POSITIVE_INFINITY) <= getPlaceRank(fieldSize)
    );
  }

  if (betType === "QUINELLA") {
    return (
      selections.length === 2 &&
      selections.every(
        (selection) =>
          (rankByRaceEntryId.get(selection.raceEntryId) ??
            Number.POSITIVE_INFINITY) <= 2,
      )
    );
  }

  if (betType === "QUINELLA_PLACE") {
    return areAllSelectionsWithinRank(selections, rankByRaceEntryId, 3, 2);
  }

  if (betType === "TRIO") {
    return areAllSelectionsWithinRank(selections, rankByRaceEntryId, 3, 3);
  }

  return (
    selections.length === getRequiredSelectionCount(betType) &&
    selections.every(
      (selection) =>
        selection.expectedRank === rankByRaceEntryId.get(selection.raceEntryId),
    )
  );
}

function areAllSelectionsWithinRank(
  selections: RacingBetSelectionSnapshot[],
  rankByRaceEntryId: Map<string, number>,
  maxRank: number,
  expectedSelectionCount: number,
) {
  return (
    selections.length === expectedSelectionCount &&
    selections.every(
      (selection) =>
        (rankByRaceEntryId.get(selection.raceEntryId) ??
          Number.POSITIVE_INFINITY) <= maxRank,
    )
  );
}

function calculateOddsNumerator(
  context: LockedRacingBettingContext,
  betType: RacingBetType,
) {
  return Math.floor(
    getCombinationCount(betType, context.race.fieldSize) *
      context.table.payoutRateBps,
  );
}

function getCombinationCount(betType: RacingBetType, fieldSize: number) {
  if (betType === "WIN") {
    return fieldSize;
  }

  if (betType === "PLACE") {
    return fieldSize / getPlaceRank(fieldSize);
  }

  if (betType === "QUINELLA") {
    return combination(fieldSize, 2);
  }

  if (betType === "QUINELLA_PLACE") {
    return combination(fieldSize, 2) / combination(3, 2);
  }

  if (betType === "TRIO") {
    return combination(fieldSize, 3);
  }

  if (betType === "TRIFECTA") {
    return permutation(fieldSize, 3);
  }

  return fieldSize * (fieldSize - 1);
}

function getPlaceRank(fieldSize: number) {
  return fieldSize <= 7 ? 2 : 3;
}

function combination(total: number, selected: number) {
  if (selected < 0 || selected > total) {
    return 0;
  }

  return permutation(total, selected) / factorial(selected);
}

function permutation(total: number, selected: number) {
  if (selected < 0 || selected > total) {
    return 0;
  }

  let result = 1;

  for (let offset = 0; offset < selected; offset += 1) {
    result *= total - offset;
  }

  return result;
}

function factorial(value: number) {
  let result = 1;

  for (let number = 2; number <= value; number += 1) {
    result *= number;
  }

  return result;
}

function calculateBetPayoutAmount(bet: typeof racingBets.$inferSelect) {
  if (bet.oddsDenominator <= 0) {
    throw new RacingSettlementError(
      "INVALID_SETTLEMENT",
      `Bet ${bet.id} has invalid odds denominator.`,
    );
  }

  return (bet.amount * BigInt(bet.oddsNumerator)) / BigInt(bet.oddsDenominator);
}

function getBettingClosesAt(context: LockedRacingBettingContext) {
  if (context.race.bettingClosesAt) {
    return context.race.bettingClosesAt;
  }

  if (!context.race.scheduledStartAt) {
    return null;
  }

  return new Date(
    context.race.scheduledStartAt.getTime() -
      context.table.bettingCloseBeforeStartSeconds * 1000,
  );
}

function getResultOrder(input: SettleRacingRaceInput) {
  return input.entries
    .slice()
    .sort((left, right) => left.finalRank - right.finalRank)
    .map((entry) => entry.raceEntryId);
}

function getRankByRaceEntryId(input: SettleRacingRaceInput) {
  return new Map(
    input.entries.map((entry) => [entry.raceEntryId, entry.finalRank]),
  );
}

function buildBetWalletMutationInput(
  input: PlaceRacingBetInput,
  context: LockedRacingBettingContext,
  selections: RacingBetSelectionSnapshot[],
  oddsNumerator: number,
) {
  return {
    userId: input.userId,
    category: "GAME" as const,
    gameType: "RACING" as const,
    type: "BET" as const,
    delta: -input.amount,
    referenceType: "RACING_RACE",
    referenceId: context.race.id,
    idempotencyKey: `racing:bet:${context.race.id}:${input.userId}:${input.commandId}`,
    memo: `Racing ${input.betType} bet`,
    metadata: {
      tableCode: context.table.code,
      betType: input.betType,
      selections,
      commandId: input.commandId,
      oddsNumerator,
      oddsDenominator: racingOddsDenominator,
    } satisfies JsonObject,
  };
}

function buildSettlementWalletMutationInput(
  bet: typeof racingBets.$inferSelect,
  payoutAmount: bigint,
  selections: RacingBetSelectionSnapshot[],
) {
  return {
    userId: bet.userId,
    category: "GAME" as const,
    gameType: "RACING" as const,
    type: "PAYOUT" as const,
    delta: payoutAmount,
    referenceType: "RACING_RACE",
    referenceId: bet.raceId,
    idempotencyKey: `racing:settlement:${bet.raceId}:${bet.id}`,
    memo: `Racing ${bet.betType} payout for bet ${bet.id}`,
    metadata: {
      betId: bet.id,
      betType: bet.betType,
      selections,
      payoutAmount: payoutAmount.toString(),
      oddsNumerator: bet.oddsNumerator,
      oddsDenominator: bet.oddsDenominator,
    } satisfies JsonObject,
  };
}

function buildCancelRefundWalletMutationInput(
  bet: typeof racingBets.$inferSelect,
  reason: string,
  selections: RacingBetSelectionSnapshot[],
) {
  return {
    userId: bet.userId,
    category: "GAME" as const,
    gameType: "RACING" as const,
    type: "CANCEL_REFUND" as const,
    delta: bet.amount,
    referenceType: "RACING_RACE",
    referenceId: bet.raceId,
    idempotencyKey: `racing:cancel:${bet.raceId}:${bet.id}`,
    memo: `Racing cancelled race refund for bet ${bet.id}`,
    metadata: {
      betId: bet.id,
      betType: bet.betType,
      selections,
      reason,
      refundAmount: bet.amount.toString(),
    } satisfies JsonObject,
  };
}

async function insertRacingAction(
  tx: WalletMutationTransaction,
  input: {
    raceId: string;
    betId?: string;
    userId?: string;
    actorType: "PLAYER" | "SYSTEM";
    actionType: "PLACE_BET" | "RACE_START" | "FINISH" | "SETTLE" | "CANCEL";
    commandId?: string;
    amount: bigint;
    payload: JsonObject;
  },
) {
  await tx
    .insert(racingActions)
    .values({
      raceId: input.raceId,
      betId: input.betId ?? null,
      userId: input.userId ?? null,
      actorType: input.actorType,
      actionType: input.actionType,
      actionSequence: await nextActionSequence(tx, input.raceId),
      commandId: input.commandId ?? null,
      amount: input.amount,
      payload: input.payload,
    })
    .onConflictDoNothing();
}

async function nextActionSequence(
  tx: WalletMutationTransaction,
  raceId: string,
) {
  const result = await tx.execute(sql<{ actionSequence: number }>`
    select coalesce(max(action_sequence), 0) + 1 as "actionSequence"
    from racing_actions
    where race_id = ${raceId}
  `);
  const [row] = getRows<{ actionSequence: number }>(result);

  return Number(row?.actionSequence ?? 1);
}

function normalizePlaceRacingBetInput(
  input: PlaceRacingBetInput,
): PlaceRacingBetInput {
  const raceId = input.raceId.trim();
  const userId = input.userId.trim();
  const commandId = input.commandId.trim();
  const betType = parseRacingBetType(input.betType);
  const selections = input.selections.map((selection) => selection.trim());
  const selectionSet = new Set(selections);

  if (!raceId || !userId || !commandId) {
    throw new RacingBettingError(
      "INVALID_BET",
      "raceId, userId, and commandId are required.",
    );
  }

  if (input.amount <= zero) {
    throw new RacingBettingError("INVALID_BET", "Bet amount must be positive.");
  }

  if (
    selections.some((selection) => !selection) ||
    selections.length !== getRequiredSelectionCount(betType)
  ) {
    throw new RacingBettingError(
      "INVALID_BET",
      `${betType} requires ${getRequiredSelectionCount(betType)} selections.`,
    );
  }

  if (selectionSet.size !== selections.length) {
    throw new RacingBettingError(
      "INVALID_BET",
      "Racing bet selections must be distinct.",
    );
  }

  return {
    raceId,
    userId,
    commandId,
    betType,
    selections,
    amount: input.amount,
  };
}

function normalizeSettleRacingRaceInput(
  input: SettleRacingRaceInput,
): SettleRacingRaceInput {
  const raceId = input.raceId.trim();

  if (!raceId) {
    throw new RacingSettlementError(
      "INVALID_SETTLEMENT",
      "raceId is required.",
    );
  }

  if (input.entries.length === 0) {
    throw new RacingSettlementError(
      "INVALID_SETTLEMENT",
      "At least one race entry is required for settlement.",
    );
  }

  return {
    raceId,
    entries: input.entries.map((entry) => {
      const raceEntryId = entry.raceEntryId.trim();

      if (!raceEntryId) {
        throw new RacingSettlementError(
          "INVALID_SETTLEMENT",
          "raceEntryId is required for every settlement entry.",
        );
      }

      if (entry.finalRank < 1 || !Number.isInteger(entry.finalRank)) {
        throw new RacingSettlementError(
          "INVALID_SETTLEMENT",
          "finalRank must be a positive integer.",
        );
      }

      if (entry.finishedAtMs < 0 || !Number.isInteger(entry.finishedAtMs)) {
        throw new RacingSettlementError(
          "INVALID_SETTLEMENT",
          "finishedAtMs must be a non-negative integer.",
        );
      }

      return {
        raceEntryId,
        finalRank: entry.finalRank,
        finishedAtMs: entry.finishedAtMs,
      };
    }),
  };
}

function normalizeCancelRacingRaceInput(
  input: CancelRacingRaceInput,
): CancelRacingRaceInput {
  const raceId = input.raceId.trim();
  const reason = input.reason.trim();

  if (!raceId || !reason) {
    throw new RacingSettlementError(
      "INVALID_CANCEL",
      "raceId and reason are required for racing cancellation.",
    );
  }

  return {
    raceId,
    reason,
  };
}

function getRequiredSelectionCount(betType: RacingBetType) {
  if (betType === "WIN" || betType === "PLACE") {
    return 1;
  }

  if (betType === "TRIO" || betType === "TRIFECTA") {
    return 3;
  }

  return 2;
}

function parseRacingBetType(value: string): RacingBetType {
  if (racingBetTypes.has(value as RacingBetType)) {
    return value as RacingBetType;
  }

  throw new RacingBettingError(
    "INVALID_BET",
    `Unsupported racing bet type ${value}.`,
  );
}

function parseRacingTableStatus(status: string): RacingTableSnapshot["status"] {
  if (status === "OPEN" || status === "MAINTENANCE" || status === "CLOSED") {
    return status;
  }

  throw new RacingBettingError(
    "TABLE_NOT_OPEN",
    `Racing table has unsupported status ${status}.`,
  );
}

function toBetSelectionSnapshot(
  selection: typeof racingBetSelections.$inferSelect,
): RacingBetSelectionSnapshot {
  return {
    raceEntryId: selection.raceEntryId,
    horseId: selection.horseId,
    selectionOrder: selection.selectionOrder,
    expectedRank: selection.expectedRank,
  };
}

function selectionsMatch(
  left: RacingBetSelectionSnapshot[],
  right: RacingBetSelectionSnapshot[],
) {
  return stableJsonStringify(left) === stableJsonStringify(right);
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([leftKey], [rightKey]) => leftKey.localeCompare(rightKey),
    );

    return `{${entries
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${stableJsonStringify(entryValue)}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "undefined";
}

function minBigInt(left: bigint, right: bigint) {
  return left < right ? left : right;
}

function toBigInt(value: bigint | string) {
  return typeof value === "bigint" ? value : BigInt(value);
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
