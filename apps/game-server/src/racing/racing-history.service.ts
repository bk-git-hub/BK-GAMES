import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  RacingHorseRecentResultSnapshot,
  RacingHorseSnapshot,
  RacingHorseStatsResponse,
  RacingHorseStatsSnapshot,
  RacingRaceResultsResponse,
  RacingSettledRaceSnapshot,
  RacingTablePhase,
} from '@bk-games/shared';

const defaultTableId = 'main';
const defaultHistoryLimit = 50;
const maxHistoryLimit = 100;
const koreaTimeOffsetMs = 9 * 60 * 60 * 1000;

@Injectable()
export class RacingHistoryService {
  async listRaceResults(
    input: RacingHistoryRequest,
  ): Promise<RacingRaceResultsResponse> {
    const context = await this.loadRaceResults(input);

    return {
      tableId: context.tableId,
      date: context.date,
      limit: context.limit,
      races: context.results.map(toSettledRaceSnapshot),
    };
  }

  async getHorseStats(
    input: RacingHistoryRequest,
  ): Promise<RacingHorseStatsResponse> {
    const context = await this.loadRaceResults(input);
    const activeHorses = await context.db.listActiveRacingHorses(
      context.table.fieldSize,
    );
    const horses = buildHorseStats(
      activeHorses.map(toHorseSnapshot),
      context.results.map(toSettledRaceSnapshot),
    );

    return {
      tableId: context.tableId,
      date: context.date,
      limit: context.limit,
      raceCount: context.results.length,
      horses,
    };
  }

  private async loadRaceResults(input: RacingHistoryRequest) {
    const tableId = normalizeTableId(input.tableId);
    const limit = normalizeHistoryLimit(input.limit);
    const dayRange = resolveKoreaDateRange(input.date);
    const db = (await import(dbPackageName)) as RacingDbModule;
    const table = await db.getRacingTableByCode(tableId);

    if (!table) {
      throw new NotFoundException(`Racing table ${tableId} was not found.`);
    }

    const results = await db.listRacingRaceResultsForDate({
      tableCode: tableId,
      from: dayRange.from,
      to: dayRange.to,
      limit,
    });

    return {
      db,
      table,
      tableId,
      date: dayRange.date,
      limit,
      results,
    };
  }
}

export type RacingHistoryRequest = {
  tableId?: string;
  date?: string;
  limit?: string;
};

type RacingDbModule = {
  getRacingTableByCode(tableId: string): Promise<RacingDbTable | null>;
  listActiveRacingHorses(limit?: number): Promise<RacingDbHorse[]>;
  listRacingRaceResultsForDate(
    input: RacingDbHistoryRequest,
  ): Promise<RacingDbHistoryResult[]>;
};

type RacingDbTable = {
  fieldSize: number;
};

type RacingDbHorse = {
  id: string;
  name: string;
  silkColor: string;
};

type RacingDbHistoryRequest = {
  tableCode: string;
  from: Date;
  to: Date;
  limit?: number;
};

type RacingDbHistoryResult = {
  race: {
    id: string;
    raceNo: number;
    status: string;
    phase: string;
    scheduledStartAt: Date | null;
    bettingOpensAt: Date | null;
    bettingClosesAt: Date | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    settledAt: Date | null;
    resultOrder: string[];
  };
  entries: RacingDbHistoryEntry[];
};

type RacingDbHistoryEntry = {
  raceEntryId: string;
  horseId: string;
  name: string;
  silkColor: string;
  number: number;
  gateNo: number;
  lane: number;
  finalRank: number;
  finishedAtMs: number;
};

type MutableHorseStats = RacingHorseSnapshot & {
  starts: number;
  wins: number;
  top2: number;
  top3: number;
  rankSum: number;
  finishMsSum: number;
  bestRank: number | null;
  worstRank: number | null;
  recentRanks: number[];
  recentResults: RacingHorseRecentResultSnapshot[];
};

function buildHorseStats(
  activeHorses: RacingHorseSnapshot[],
  races: RacingSettledRaceSnapshot[],
): RacingHorseStatsSnapshot[] {
  const statsByHorseId = new Map<string, MutableHorseStats>();

  for (const horse of activeHorses) {
    statsByHorseId.set(horse.horseId, {
      ...horse,
      starts: 0,
      wins: 0,
      top2: 0,
      top3: 0,
      rankSum: 0,
      finishMsSum: 0,
      bestRank: null,
      worstRank: null,
      recentRanks: [],
      recentResults: [],
    });
  }

  for (const race of races) {
    for (const entry of race.entries) {
      const stats =
        statsByHorseId.get(entry.horseId) ?? createHorseStatsFromEntry(entry);

      stats.starts += 1;
      stats.rankSum += entry.finalRank;
      stats.finishMsSum += entry.finishedAtMs;
      stats.recentRanks.push(entry.finalRank);
      stats.recentResults.push({
        raceId: race.raceId,
        raceNo: race.raceNo,
        finalRank: entry.finalRank,
        finishedAtMs: entry.finishedAtMs,
      });

      if (entry.finalRank === 1) {
        stats.wins += 1;
      }

      if (entry.finalRank <= 2) {
        stats.top2 += 1;
      }

      if (entry.finalRank <= 3) {
        stats.top3 += 1;
      }

      stats.bestRank =
        stats.bestRank === null
          ? entry.finalRank
          : Math.min(stats.bestRank, entry.finalRank);
      stats.worstRank =
        stats.worstRank === null
          ? entry.finalRank
          : Math.max(stats.worstRank, entry.finalRank);
      statsByHorseId.set(entry.horseId, stats);
    }
  }

  return Array.from(statsByHorseId.values())
    .sort((left, right) => left.number - right.number)
    .map(toHorseStatsSnapshot);
}

function createHorseStatsFromEntry(
  entry: RacingSettledRaceSnapshot['entries'][number],
): MutableHorseStats {
  return {
    horseId: entry.horseId,
    name: entry.name,
    silkColor: entry.silkColor,
    number: entry.number,
    starts: 0,
    wins: 0,
    top2: 0,
    top3: 0,
    rankSum: 0,
    finishMsSum: 0,
    bestRank: null,
    worstRank: null,
    recentRanks: [],
    recentResults: [],
  };
}

function toHorseStatsSnapshot(
  stats: MutableHorseStats,
): RacingHorseStatsSnapshot {
  return {
    horseId: stats.horseId,
    name: stats.name,
    silkColor: stats.silkColor,
    number: stats.number,
    starts: stats.starts,
    wins: stats.wins,
    winRate: calculateRate(stats.wins, stats.starts),
    top2: stats.top2,
    top2Rate: calculateRate(stats.top2, stats.starts),
    top3: stats.top3,
    top3Rate: calculateRate(stats.top3, stats.starts),
    averageRank:
      stats.starts > 0
        ? roundToFourDecimals(stats.rankSum / stats.starts)
        : null,
    averageFinishMs:
      stats.starts > 0
        ? roundToFourDecimals(stats.finishMsSum / stats.starts)
        : null,
    bestRank: stats.bestRank,
    worstRank: stats.worstRank,
    recentRanks: stats.recentRanks,
    recentResults: stats.recentResults,
  };
}

function toSettledRaceSnapshot(
  result: RacingDbHistoryResult,
): RacingSettledRaceSnapshot {
  return {
    raceId: result.race.id,
    raceNo: result.race.raceNo,
    status: toRacingTablePhase(result.race.status),
    phase: toRacingTablePhase(result.race.phase),
    scheduledStartAt: toIsoStringOrNull(result.race.scheduledStartAt),
    bettingOpensAt: toIsoStringOrNull(result.race.bettingOpensAt),
    bettingClosesAt: toIsoStringOrNull(result.race.bettingClosesAt),
    startedAt: toIsoStringOrNull(result.race.startedAt),
    finishedAt: toIsoStringOrNull(result.race.finishedAt),
    settledAt: toIsoStringOrNull(result.race.settledAt),
    resultOrder: result.race.resultOrder,
    entries: result.entries.map((entry) => ({
      raceEntryId: entry.raceEntryId,
      horseId: entry.horseId,
      name: entry.name,
      silkColor: entry.silkColor,
      number: entry.number,
      gateNo: entry.gateNo,
      lane: entry.lane,
      finalRank: entry.finalRank,
      finishedAtMs: entry.finishedAtMs,
    })),
  };
}

function normalizeTableId(tableId: string | undefined) {
  const normalizedTableId = tableId?.trim() || defaultTableId;

  if (!/^[a-zA-Z0-9_-]+$/.test(normalizedTableId)) {
    throw new BadRequestException(
      'tableId may only contain letters, numbers, underscores, and hyphens.',
    );
  }

  return normalizedTableId;
}

function normalizeHistoryLimit(limit: string | undefined) {
  if (limit === undefined || limit.trim() === '') {
    return defaultHistoryLimit;
  }

  const parsedLimit = Number(limit);

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
    throw new BadRequestException('limit must be a positive integer.');
  }

  return Math.min(parsedLimit, maxHistoryLimit);
}

function resolveKoreaDateRange(date: string | undefined) {
  const normalizedDate = date?.trim() || getTodayInKorea();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    throw new BadRequestException('date must use YYYY-MM-DD format.');
  }

  const [year, month, day] = normalizedDate.split('-').map(Number);
  const normalizedFromParts = new Date(Date.UTC(year, month - 1, day))
    .toISOString()
    .slice(0, 10);

  if (normalizedFromParts !== normalizedDate) {
    throw new BadRequestException('date must be a valid calendar date.');
  }

  const from = new Date(Date.UTC(year, month - 1, day) - koreaTimeOffsetMs);
  const to = new Date(Date.UTC(year, month - 1, day + 1) - koreaTimeOffsetMs);

  return {
    date: normalizedDate,
    from,
    to,
  };
}

function getTodayInKorea(now = new Date()) {
  return new Date(now.getTime() + koreaTimeOffsetMs).toISOString().slice(0, 10);
}

function toHorseSnapshot(
  horse: RacingDbHorse,
  index: number,
): RacingHorseSnapshot {
  return {
    horseId: horse.id,
    name: horse.name,
    silkColor: horse.silkColor,
    number: index + 1,
  };
}

function toRacingTablePhase(value: string): RacingTablePhase {
  if (
    value === 'WAITING' ||
    value === 'BETTING' ||
    value === 'LOCKING_BETS' ||
    value === 'RUNNING' ||
    value === 'FINISHING' ||
    value === 'SETTLING' ||
    value === 'SETTLED' ||
    value === 'ROUND_END' ||
    value === 'CANCELLED'
  ) {
    return value;
  }

  throw new BadRequestException(`Unsupported racing phase ${value}.`);
}

function calculateRate(count: number, total: number) {
  return total > 0 ? roundToFourDecimals(count / total) : 0;
}

function roundToFourDecimals(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function toIsoStringOrNull(value: Date | null) {
  return value ? value.toISOString() : null;
}

const dbPackageName: string = '@bk-games/db';
