import { Injectable } from '@nestjs/common';
import type {
  RacingBetType,
  RacingHorseSnapshot,
  RacingRaceSnapshot,
  RacingTableStatus,
} from '@bk-games/shared';
import {
  RacingTableError,
  type RacingTableConfig,
} from './racing-table.service';

@Injectable()
export class RacingTableConfigService {
  async getTableConfig(tableId: string): Promise<RacingTableConfig> {
    const db = (await import(dbPackageName)) as RacingDbModule;
    const table = await db.getRacingTableByCode(tableId);

    if (!table) {
      throw new RacingTableError(
        'TABLE_NOT_FOUND',
        `Racing table ${tableId} was not found.`,
      );
    }

    const horses = await db.listActiveRacingHorses(table.fieldSize);

    return {
      status: table.status,
      fieldSize: table.fieldSize,
      minBet: BigInt(table.minBet),
      maxBet: BigInt(table.maxBet),
      payoutRateBps: table.payoutRateBps,
      bettingTimeoutSeconds: table.bettingTimeoutSeconds,
      raceIntervalSeconds: table.raceIntervalSeconds,
      bettingCloseBeforeStartSeconds: table.bettingCloseBeforeStartSeconds,
      tickIntervalMs: table.tickIntervalMs,
      raceDistanceM: table.raceDistanceM,
      roundEndDelaySeconds: table.roundEndDelaySeconds,
      betTypes: readBetTypes(table.rules),
      horses: horses.map(toHorseSnapshot),
    };
  }

  async getScheduledRace(
    tableId: string,
    now?: Date,
  ): Promise<RacingRaceSnapshot> {
    const db = (await import(dbPackageName)) as RacingDbModule;
    const result = now
      ? await db.ensureScheduledRacingRace({ tableCode: tableId, now })
      : ((await db.getActiveRacingRaceForTable({ tableCode: tableId })) ??
        (await db.ensureScheduledRacingRace({ tableCode: tableId })));

    return {
      raceId: result.race.id,
      raceNo: result.race.raceNo,
      status: result.race.status,
      phase: result.race.phase,
      scheduledStartAt: toIsoStringOrNull(result.race.scheduledStartAt),
      bettingOpensAt: toIsoStringOrNull(result.race.bettingOpensAt),
      bettingClosesAt: toIsoStringOrNull(result.race.bettingClosesAt),
      startedAt: toIsoStringOrNull(result.race.startedAt),
      finishedAt: toIsoStringOrNull(result.race.finishedAt),
      settledAt: toIsoStringOrNull(result.race.settledAt),
      resultOrder: Array.isArray(result.race.resultOrder)
        ? result.race.resultOrder
        : [],
      entries: result.entries.map((entry) => ({
        raceEntryId: entry.raceEntryId,
        horseId: entry.horseId,
        name: entry.horseName,
        silkColor: entry.silkColor,
        number: entry.number,
        gateNo: entry.gateNo,
        lane: entry.lane,
        finalRank: entry.finalRank,
        finishedAtMs: entry.finishedAtMs,
      })),
    };
  }

  async advanceRaceLifecycle(tableId: string, now?: Date) {
    const db = (await import(dbPackageName)) as RacingDbModule;

    return db.advanceRacingRaceLifecycle({ tableCode: tableId, now });
  }
}

type RacingDbModule = {
  getRacingTableByCode(tableId: string): Promise<RacingDbTable | null>;
  listActiveRacingHorses(limit?: number): Promise<RacingDbHorse[]>;
  ensureScheduledRacingRace(
    input: RacingEnsureScheduledRaceInput,
  ): Promise<RacingScheduledRaceResult>;
  getActiveRacingRaceForTable(
    input: RacingEnsureScheduledRaceInput,
  ): Promise<RacingScheduledRaceResult | null>;
  advanceRacingRaceLifecycle(
    input: RacingLifecycleAdvanceInput,
  ): Promise<RacingLifecycleAdvanceResult>;
};

type RacingDbTable = {
  status: RacingTableStatus;
  fieldSize: number;
  minBet: bigint | string;
  maxBet: bigint | string;
  payoutRateBps: number;
  bettingTimeoutSeconds: number;
  raceIntervalSeconds: number;
  bettingCloseBeforeStartSeconds: number;
  tickIntervalMs: number;
  raceDistanceM: number;
  roundEndDelaySeconds: number;
  rules: Record<string, unknown>;
};

type RacingDbHorse = {
  id: string;
  name: string;
  silkColor: string;
};

type RacingEnsureScheduledRaceInput = {
  tableCode: string;
  now?: Date;
};

type RacingLifecycleAdvanceInput = RacingEnsureScheduledRaceInput;

type RacingScheduledRaceResult = {
  race: {
    id: string;
    raceNo: number;
    status: RacingRaceSnapshot['status'];
    phase: RacingRaceSnapshot['phase'];
    scheduledStartAt: Date | null;
    bettingOpensAt: Date | null;
    bettingClosesAt: Date | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    settledAt: Date | null;
    resultOrder: string[] | null;
  };
  entries: RacingScheduledRaceEntry[];
};

type RacingScheduledRaceEntry = {
  raceEntryId: string;
  horseId: string;
  number: number;
  gateNo: number;
  lane: number;
  finalRank: number | null;
  finishedAtMs: number | null;
  horseName: string;
  silkColor: string;
};

type RacingLifecycleAdvanceResult = {
  started: unknown;
  settled: RacingSettlementResult | null;
  cancelled: RacingCancellationResult | null;
  roundEnded: unknown;
};

export type RacingSettlementResult = {
  raceId: string;
  resultOrder: string[];
  bets: RacingSettlementBetResult[];
};

export type RacingSettlementBetResult = {
  betId: string;
  userId: string;
  betType: RacingBetType;
  outcome: 'WIN' | 'LOSE';
  payoutAmount: bigint | string;
  netAmount: bigint | string;
  walletMutation: {
    wallet: { balance: bigint | string };
    ledger: {
      id: string;
      delta: bigint | string;
      type?: 'PAYOUT';
    };
  } | null;
};

export type RacingCancellationResult = {
  raceId: string;
  bets: RacingCancellationBetResult[];
};

export type RacingCancellationBetResult = {
  betId: string;
  userId: string;
  betType: RacingBetType;
  refundAmount: bigint | string;
  walletMutation: {
    wallet: { balance: bigint | string };
    ledger: {
      id: string;
      delta: bigint | string;
      type?: 'CANCEL_REFUND';
    };
  };
};

function readBetTypes(rules: Record<string, unknown>): RacingBetType[] {
  const betTypes = Array.isArray(rules.betTypes) ? rules.betTypes : [];
  const normalizedBetTypes = betTypes.filter(isRacingBetType);

  return normalizedBetTypes.length > 0
    ? normalizedBetTypes
    : [
        'WIN',
        'PLACE',
        'QUINELLA',
        'EXACTA',
        'QUINELLA_PLACE',
        'TRIO',
        'TRIFECTA',
      ];
}

function isRacingBetType(value: unknown): value is RacingBetType {
  return (
    value === 'WIN' ||
    value === 'PLACE' ||
    value === 'QUINELLA' ||
    value === 'EXACTA' ||
    value === 'QUINELLA_PLACE' ||
    value === 'TRIO' ||
    value === 'TRIFECTA'
  );
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

function toIsoStringOrNull(value: Date | null) {
  return value ? value.toISOString() : null;
}

const dbPackageName: string = '@bk-games/db';
