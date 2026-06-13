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

  async getScheduledRace(tableId: string): Promise<RacingRaceSnapshot> {
    const db = (await import(dbPackageName)) as RacingDbModule;
    const result = await db.ensureScheduledRacingRace({ tableCode: tableId });

    return {
      raceId: result.race.id,
      raceNo: result.race.raceNo,
      status: result.race.status,
      phase: result.race.phase,
      scheduledStartAt: toIsoStringOrNull(result.race.scheduledStartAt),
      bettingOpensAt: toIsoStringOrNull(result.race.bettingOpensAt),
      bettingClosesAt: toIsoStringOrNull(result.race.bettingClosesAt),
      entries: result.entries.map((entry) => ({
        raceEntryId: entry.raceEntryId,
        horseId: entry.horseId,
        name: entry.horseName,
        silkColor: entry.silkColor,
        number: entry.number,
        gateNo: entry.gateNo,
        lane: entry.lane,
      })),
    };
  }
}

type RacingDbModule = {
  getRacingTableByCode(tableId: string): Promise<RacingDbTable | null>;
  listActiveRacingHorses(limit?: number): Promise<RacingDbHorse[]>;
  ensureScheduledRacingRace(
    input: RacingEnsureScheduledRaceInput,
  ): Promise<RacingScheduledRaceResult>;
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
};

type RacingScheduledRaceResult = {
  race: {
    id: string;
    raceNo: number;
    status: RacingRaceSnapshot['status'];
    phase: RacingRaceSnapshot['phase'];
    scheduledStartAt: Date | null;
    bettingOpensAt: Date | null;
    bettingClosesAt: Date | null;
  };
  entries: RacingScheduledRaceEntry[];
};

type RacingScheduledRaceEntry = {
  raceEntryId: string;
  horseId: string;
  number: number;
  gateNo: number;
  lane: number;
  horseName: string;
  silkColor: string;
};

function readBetTypes(rules: Record<string, unknown>): RacingBetType[] {
  const betTypes = Array.isArray(rules.betTypes) ? rules.betTypes : [];
  const normalizedBetTypes = betTypes.filter(isRacingBetType);

  return normalizedBetTypes.length > 0
    ? normalizedBetTypes
    : ['WIN', 'QUINELLA', 'EXACTA'];
}

function isRacingBetType(value: unknown): value is RacingBetType {
  return value === 'WIN' || value === 'QUINELLA' || value === 'EXACTA';
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
