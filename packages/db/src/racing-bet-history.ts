import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "./client.js";
import {
  racingBets,
  racingBetSelections,
  racingHorses,
  racingRaceEntries,
  racingRaces,
  racingTables,
} from "./schema.js";

const defaultBetHistoryLimit = 20;
const maxBetHistoryLimit = 100;

export type ListUserRacingBetsInput = {
  tableCode: string;
  userId: string;
  limit?: number;
};

export type RacingBetHistoryResult = {
  bet: {
    id: string;
    raceId: string;
    raceNo: number;
    tableCode: string;
    betType: string;
    status: string;
    amount: bigint;
    payoutAmount: bigint;
    createdAt: Date;
    settledAt: Date | null;
  };
  selections: RacingBetHistorySelectionResult[];
};

export type RacingBetHistorySelectionResult = {
  betId: string;
  raceEntryId: string;
  entryNo: number;
  displayName: string;
  selectionOrder: number;
};

export async function listUserRacingBets(
  input: ListUserRacingBetsInput,
): Promise<RacingBetHistoryResult[]> {
  const normalizedInput = normalizeListUserRacingBetsInput(input);

  const bets = await db
    .select({
      id: racingBets.id,
      raceId: racingBets.raceId,
      raceNo: racingRaces.raceNo,
      tableCode: racingTables.code,
      betType: racingBets.betType,
      status: racingBets.status,
      amount: racingBets.amount,
      payoutAmount: racingBets.payoutAmount,
      createdAt: racingBets.createdAt,
      settledAt: racingBets.settledAt,
    })
    .from(racingBets)
    .innerJoin(racingRaces, eq(racingBets.raceId, racingRaces.id))
    .innerJoin(racingTables, eq(racingBets.tableId, racingTables.id))
    .where(
      and(
        eq(racingTables.code, normalizedInput.tableCode),
        eq(racingBets.userId, normalizedInput.userId),
      ),
    )
    .orderBy(desc(racingBets.createdAt), desc(racingBets.id))
    .limit(normalizedInput.limit);

  const betIds = bets.map((bet) => bet.id);

  if (betIds.length === 0) {
    return [];
  }

  const selectionRows = await db
    .select({
      betId: racingBetSelections.betId,
      raceEntryId: racingBetSelections.raceEntryId,
      entryNo: racingRaceEntries.number,
      displayName: racingHorses.name,
      selectionOrder: racingBetSelections.selectionOrder,
    })
    .from(racingBetSelections)
    .innerJoin(
      racingRaceEntries,
      eq(racingBetSelections.raceEntryId, racingRaceEntries.id),
    )
    .innerJoin(racingHorses, eq(racingBetSelections.horseId, racingHorses.id))
    .where(inArray(racingBetSelections.betId, betIds))
    .orderBy(racingBetSelections.betId, racingBetSelections.selectionOrder);

  const selectionsByBetId = new Map<
    string,
    RacingBetHistorySelectionResult[]
  >();

  for (const row of selectionRows) {
    const selections = selectionsByBetId.get(row.betId) ?? [];
    selections.push(row);
    selectionsByBetId.set(row.betId, selections);
  }

  return bets.map((bet) => ({
    bet: {
      id: bet.id,
      raceId: bet.raceId,
      raceNo: bet.raceNo,
      tableCode: bet.tableCode,
      betType: bet.betType,
      status: bet.status,
      amount: bet.amount,
      payoutAmount: bet.payoutAmount,
      createdAt: bet.createdAt,
      settledAt: bet.settledAt,
    },
    selections: selectionsByBetId.get(bet.id) ?? [],
  }));
}

function normalizeListUserRacingBetsInput(
  input: ListUserRacingBetsInput,
): Required<ListUserRacingBetsInput> {
  const tableCode = input.tableCode.trim();
  const userId = input.userId.trim();
  const limit = normalizeBetHistoryLimit(input.limit);

  if (!tableCode) {
    throw new RacingBetHistoryError("tableCode is required.");
  }

  if (!userId) {
    throw new RacingBetHistoryError("userId is required.");
  }

  return {
    tableCode,
    userId,
    limit,
  };
}

function normalizeBetHistoryLimit(limit: number | undefined) {
  if (limit === undefined || !Number.isFinite(limit)) {
    return defaultBetHistoryLimit;
  }

  return Math.min(maxBetHistoryLimit, Math.max(1, Math.trunc(limit)));
}

export class RacingBetHistoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RacingBetHistoryError";
  }
}
