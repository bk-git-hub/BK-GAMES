import { and, eq, sql } from "drizzle-orm";

import { db } from "./client.js";
import {
  racingActions,
  racingBets,
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

export type PlaceRacingWinBetInput = {
  raceId: string;
  raceEntryId: string;
  userId: string;
  amount: bigint;
  commandId: string;
};

export type PlaceRacingWinBetResult = {
  race: RacingRaceSnapshot;
  table: RacingTableSnapshot;
  raceEntry: RacingRaceEntrySnapshot;
  bet: typeof racingBets.$inferSelect;
  walletMutation: WalletMutationResult;
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
  raceEntryId: string;
  horseId: string;
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
  raceEntryId: string;
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
};

export type RacingRaceSnapshot = {
  id: string;
  tableId: string;
  status: string;
  phase: string;
  fieldSize: number;
};

export type RacingRaceEntrySnapshot = {
  id: string;
  raceId: string;
  horseId: string;
  number: number;
};

type LockedRacingBettingContext = {
  table: RacingTableSnapshot;
  race: RacingRaceSnapshot;
  raceEntry: RacingRaceEntrySnapshot;
};

type LockedRacingBettingContextRow = {
  tableId: string;
  tableCode: string;
  tableStatus: string;
  minBet: bigint | string;
  maxBet: bigint | string;
  payoutRateBps: number;
  raceId: string;
  raceStatus: string;
  racePhase: string;
  fieldSize: number;
  raceEntryId: string;
  horseId: string;
  number: number;
};

type LockedRacingRaceRow = {
  id: string;
  tableId: string;
  status: string;
  phase: string;
  fieldSize: number;
  resultOrder: string[] | null;
};

export async function placeRacingWinBet(
  input: PlaceRacingWinBetInput,
): Promise<PlaceRacingWinBetResult> {
  const normalizedInput = normalizePlaceRacingWinBetInput(input);

  return db.transaction((tx) =>
    placeRacingWinBetInTransaction(tx, normalizedInput),
  );
}

export async function placeRacingWinBetInTransaction(
  tx: WalletMutationTransaction,
  input: PlaceRacingWinBetInput,
): Promise<PlaceRacingWinBetResult> {
  const context = await lockRacingBettingContext(
    tx,
    input.raceId,
    input.raceEntryId,
  );

  assertRaceAcceptsBets(context);

  const existingBet = await findRacingBetByRaceAndUser(
    tx,
    input.raceId,
    input.userId,
  );

  if (existingBet) {
    assertExistingRacingBetMatches(existingBet, context, input);

    return {
      race: context.race,
      table: context.table,
      raceEntry: context.raceEntry,
      bet: existingBet,
      walletMutation: await applyWalletMutationInTransaction(
        tx,
        buildBetWalletMutationInput(input, context),
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

  const oddsNumerator = calculateOddsNumerator(context);
  const walletMutation = await applyWalletMutationInTransaction(
    tx,
    buildBetWalletMutationInput(input, context),
  );
  const now = new Date();
  const [bet] = await tx
    .insert(racingBets)
    .values({
      raceId: context.race.id,
      tableId: context.table.id,
      raceEntryId: context.raceEntry.id,
      horseId: context.raceEntry.horseId,
      userId: input.userId,
      betType: "WIN",
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
    .returning();

  if (!bet) {
    throw new RacingBettingError(
      "INVALID_BET",
      "Failed to insert racing bet.",
    );
  }

  await insertRacingAction(tx, {
    raceId: context.race.id,
    betId: bet.id,
    userId: input.userId,
    actorType: "PLAYER",
    actionType: "PLACE_BET",
    commandId: input.commandId,
    amount: input.amount,
    payload: {
      raceEntryId: context.raceEntry.id,
      horseId: context.raceEntry.horseId,
      horseNumber: context.raceEntry.number,
      oddsNumerator,
      oddsDenominator: racingOddsDenominator,
    },
  });

  return {
    race: context.race,
    table: context.table,
    raceEntry: context.raceEntry,
    bet,
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
  const resultOrder = input.entries
    .slice()
    .sort((left, right) => left.finalRank - right.finalRank)
    .map((entry) => entry.raceEntryId);
  const winnerRaceEntryId = resultOrder[0];

  if (!winnerRaceEntryId) {
    throw new RacingSettlementError(
      "INVALID_SETTLEMENT",
      "Settlement result must include a winner.",
    );
  }

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
  const betResults: SettleRacingBetResult[] = [];

  for (const bet of bets) {
    if (bet.status !== "PLACED") {
      throw new RacingSettlementError(
        "SETTLEMENT_CONFLICT",
        `Bet ${bet.id} is already ${bet.status}.`,
      );
    }

    const outcome = bet.raceEntryId === winnerRaceEntryId ? "WIN" : "LOSE";
    const payoutAmount =
      outcome === "WIN" ? calculateBetPayoutAmount(bet) : zero;
    const netAmount = payoutAmount - bet.amount;
    const walletMutation =
      payoutAmount > zero
        ? await applyWalletMutationInTransaction(
            tx,
            buildSettlementWalletMutationInput(bet, payoutAmount),
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
        raceEntryId: bet.raceEntryId,
        horseId: bet.horseId,
        outcome,
        payoutAmount: payoutAmount.toString(),
        netAmount: netAmount.toString(),
      },
    });

    betResults.push({
      betId: bet.id,
      userId: bet.userId,
      raceEntryId: bet.raceEntryId,
      horseId: bet.horseId,
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
  const betResults: CancelRacingBetResult[] = [];

  for (const bet of bets) {
    if (bet.status !== "PLACED") {
      throw new RacingSettlementError(
        "INVALID_CANCEL",
        `Bet ${bet.id} is already ${bet.status}.`,
      );
    }

    const walletMutation = await applyWalletMutationInTransaction(
      tx,
      buildCancelRefundWalletMutationInput(bet, input.reason),
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
        reason: input.reason,
        raceEntryId: bet.raceEntryId,
        horseId: bet.horseId,
        refundAmount: bet.amount.toString(),
      },
    });

    betResults.push({
      betId: bet.id,
      userId: bet.userId,
      raceEntryId: bet.raceEntryId,
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
  raceEntryId: string,
): Promise<LockedRacingBettingContext> {
  const result = await tx.execute(sql<LockedRacingBettingContextRow>`
    select
      rt.id as "tableId",
      rt.code as "tableCode",
      rt.status as "tableStatus",
      rt.min_bet as "minBet",
      rt.max_bet as "maxBet",
      rt.payout_rate_bps as "payoutRateBps",
      rr.id as "raceId",
      rr.status as "raceStatus",
      rr.phase as "racePhase",
      rr.field_size as "fieldSize",
      re.id as "raceEntryId",
      re.horse_id as "horseId",
      re.number as "number"
    from racing_races rr
    inner join racing_tables rt on rt.id = rr.table_id
    inner join racing_race_entries re on re.race_id = rr.id
    where rr.id = ${raceId}
      and re.id = ${raceEntryId}
    for update of rr, rt, re
  `);
  const [row] = getRows<LockedRacingBettingContextRow>(result);

  if (!row) {
    const [race] = await tx
      .select({ id: racingRaces.id })
      .from(racingRaces)
      .where(eq(racingRaces.id, raceId))
      .limit(1);

    throw new RacingBettingError(
      race ? "RACE_ENTRY_NOT_FOUND" : "RACE_NOT_FOUND",
      race
        ? `Race entry ${raceEntryId} was not found in race ${raceId}.`
        : `Race ${raceId} was not found.`,
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
    },
    race: {
      id: row.raceId,
      tableId: row.tableId,
      status: row.raceStatus,
      phase: row.racePhase,
      fieldSize: Number(row.fieldSize),
    },
    raceEntry: {
      id: row.raceEntryId,
      raceId: row.raceId,
      horseId: row.horseId,
      number: Number(row.number),
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

async function findRacingBetByRaceAndUser(
  tx: WalletMutationTransaction,
  raceId: string,
  userId: string,
) {
  const [bet] = await tx
    .select()
    .from(racingBets)
    .where(and(eq(racingBets.raceId, raceId), eq(racingBets.userId, userId)))
    .limit(1);

  return bet ?? null;
}

async function findRacingBetsByRace(
  tx: WalletMutationTransaction,
  raceId: string,
) {
  return tx
    .select()
    .from(racingBets)
    .where(eq(racingBets.raceId, raceId));
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

async function readSettledRacingRaceResult(
  tx: WalletMutationTransaction,
  input: SettleRacingRaceInput,
): Promise<SettleRacingRaceResult> {
  const entries = await findRacingRaceEntries(tx, input.raceId);

  assertSettlementEntriesMatchRace(input, entries);

  for (const entryInput of input.entries) {
    const entry = entries.find((candidate) => candidate.id === entryInput.raceEntryId);

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

  const resultOrder = input.entries
    .slice()
    .sort((left, right) => left.finalRank - right.finalRank)
    .map((entry) => entry.raceEntryId);
  const winnerRaceEntryId = resultOrder[0];
  const bets = await findRacingBetsByRace(tx, input.raceId);
  const betResults: SettleRacingBetResult[] = [];

  for (const bet of bets) {
    const outcome = bet.raceEntryId === winnerRaceEntryId ? "WIN" : "LOSE";

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
            buildSettlementWalletMutationInput(bet, payoutAmount),
          )
        : null;

    betResults.push({
      betId: bet.id,
      userId: bet.userId,
      raceEntryId: bet.raceEntryId,
      horseId: bet.horseId,
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
  const betResults: CancelRacingBetResult[] = [];

  for (const bet of bets) {
    if (bet.status !== "CANCELLED") {
      throw new RacingSettlementError(
        "INVALID_CANCEL",
        `Bet ${bet.id} is not cancelled.`,
      );
    }

    betResults.push({
      betId: bet.id,
      userId: bet.userId,
      raceEntryId: bet.raceEntryId,
      refundAmount: bet.amount,
      walletMutation: await applyWalletMutationInTransaction(
        tx,
        buildCancelRefundWalletMutationInput(bet, input.reason),
      ),
    });
  }

  return {
    raceId: input.raceId,
    bets: betResults,
  };
}

function assertRaceAcceptsBets(context: LockedRacingBettingContext) {
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
}

function assertExistingRacingBetMatches(
  bet: typeof racingBets.$inferSelect,
  context: LockedRacingBettingContext,
  input: PlaceRacingWinBetInput,
) {
  if (bet.commandId !== input.commandId) {
    throw new RacingBettingError(
      "BET_ALREADY_PLACED",
      `User ${input.userId} already placed a bet for race ${input.raceId}.`,
    );
  }

  const mismatched =
    bet.betType !== "WIN" ||
    bet.userId !== input.userId ||
    bet.raceId !== context.race.id ||
    bet.tableId !== context.table.id ||
    bet.raceEntryId !== context.raceEntry.id ||
    bet.horseId !== context.raceEntry.horseId ||
    bet.amount !== input.amount ||
    bet.oddsNumerator !== calculateOddsNumerator(context) ||
    bet.oddsDenominator !== racingOddsDenominator;

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

function calculateOddsNumerator(context: LockedRacingBettingContext) {
  return context.race.fieldSize * context.table.payoutRateBps;
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

function buildBetWalletMutationInput(
  input: PlaceRacingWinBetInput,
  context: LockedRacingBettingContext,
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
    memo: `Racing win bet on entry ${context.raceEntry.number}`,
    metadata: {
      tableCode: context.table.code,
      raceEntryId: context.raceEntry.id,
      horseId: context.raceEntry.horseId,
      horseNumber: context.raceEntry.number,
      commandId: input.commandId,
      oddsNumerator: calculateOddsNumerator(context),
      oddsDenominator: racingOddsDenominator,
    } satisfies JsonObject,
  };
}

function buildSettlementWalletMutationInput(
  bet: typeof racingBets.$inferSelect,
  payoutAmount: bigint,
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
    memo: `Racing win payout for bet ${bet.id}`,
    metadata: {
      betId: bet.id,
      raceEntryId: bet.raceEntryId,
      horseId: bet.horseId,
      payoutAmount: payoutAmount.toString(),
      oddsNumerator: bet.oddsNumerator,
      oddsDenominator: bet.oddsDenominator,
    } satisfies JsonObject,
  };
}

function buildCancelRefundWalletMutationInput(
  bet: typeof racingBets.$inferSelect,
  reason: string,
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
      raceEntryId: bet.raceEntryId,
      horseId: bet.horseId,
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

function normalizePlaceRacingWinBetInput(
  input: PlaceRacingWinBetInput,
): PlaceRacingWinBetInput {
  const raceId = input.raceId.trim();
  const raceEntryId = input.raceEntryId.trim();
  const userId = input.userId.trim();
  const commandId = input.commandId.trim();

  if (!raceId || !raceEntryId || !userId || !commandId) {
    throw new RacingBettingError(
      "INVALID_BET",
      "raceId, raceEntryId, userId, and commandId are required.",
    );
  }

  if (input.amount <= zero) {
    throw new RacingBettingError(
      "INVALID_BET",
      "Bet amount must be positive.",
    );
  }

  return {
    raceId,
    raceEntryId,
    userId,
    commandId,
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

function parseRacingTableStatus(status: string): RacingTableSnapshot["status"] {
  if (status === "OPEN" || status === "MAINTENANCE" || status === "CLOSED") {
    return status;
  }

  throw new RacingBettingError(
    "TABLE_NOT_OPEN",
    `Racing table has unsupported status ${status}.`,
  );
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
