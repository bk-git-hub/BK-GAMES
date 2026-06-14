import { Injectable } from '@nestjs/common';
import {
  type RacingBetType,
  type RacingHorseSnapshot,
  type RacingRaceSnapshot,
  type RacingRaceTickSnapshot,
  type RacingSocketErrorCode,
  type RacingSocketUser,
  type RacingTableEventPayload,
  type RacingTablePhase,
  type RacingTableState,
  type RacingTableStatus,
  type RacingTableSummary,
} from '@bk-games/shared';

export type RacingTableConfig = {
  status: RacingTableStatus;
  fieldSize: number;
  minBet: bigint;
  maxBet: bigint;
  payoutRateBps: number;
  bettingTimeoutSeconds: number;
  raceIntervalSeconds: number;
  bettingCloseBeforeStartSeconds: number;
  tickIntervalMs: number;
  raceDistanceM: number;
  roundEndDelaySeconds: number;
  betTypes: RacingBetType[];
  horses: RacingHorseSnapshot[];
};

export type RacingConfigureTableInput = {
  tableId: string;
  config: RacingTableConfig;
  race?: RacingRaceSnapshot | null;
};

export type RacingJoinTableInput = {
  tableId: string;
  socketId: string;
  user: RacingSocketUser;
};

export type RacingCurrentRaceInput = {
  tableId: string;
  raceId: string;
};

export type RacingRecordBetPlacedInput = {
  tableId: string;
  user: RacingSocketUser;
  raceId: string;
  betId: string;
  betType: RacingBetType;
  raceEntryIds: string[];
};

export type RacingRecordRaceTickInput = {
  tableId: string;
  tick: RacingRaceTickSnapshot;
};

export type RacingTableMutationResult = {
  state: RacingTableState;
  event: RacingTableEventPayload;
};

@Injectable()
export class RacingTableService {
  private readonly tables = new Map<string, RacingTableRuntime>();

  configureTable(
    input: RacingConfigureTableInput,
  ): RacingTableMutationResult | null {
    const tableId = normalizeTableId(input.tableId);
    const config = normalizeTableConfig(input.config);
    const existing = this.tables.get(tableId);

    if (!existing) {
      const table = this.createRuntimeTable(tableId, config, input.race ?? null);

      this.tables.set(tableId, table);
      return {
        state: this.toState(table),
        event: this.toEvent(table, 'RACE_SCHEDULED', 'SYSTEM'),
      };
    }

    const previousKey = buildSyncKey(existing);

    this.applyTableConfig(existing, config, input.race ?? null);

    if (previousKey === buildSyncKey(existing)) {
      return null;
    }

    this.bump(existing);
    const eventType = getSyncEventType(previousKey, existing);

    return {
      state: this.toState(existing),
      event: this.toEvent(existing, eventType, 'SYSTEM', {
        raceId: existing.race?.raceId,
        resultOrder: existing.race?.resultOrder,
      }),
    };
  }

  joinTable(input: RacingJoinTableInput): RacingTableMutationResult {
    const table = this.getTable(input.tableId);
    const user = normalizeSocketUser(input.user);

    table.connections.set(input.socketId, user);
    this.bump(table);

    return {
      state: this.toState(table),
      event: this.toEvent(table, 'TABLE_JOINED', user.userId),
    };
  }

  requireCurrentRace(input: RacingCurrentRaceInput): RacingRaceSnapshot {
    const table = this.getTable(input.tableId);
    const raceId = input.raceId.trim();

    if (!raceId) {
      throw new RacingTableError('RACE_NOT_FOUND', 'raceId is required.');
    }

    if (!table.race || table.race.raceId !== raceId) {
      throw new RacingTableError(
        'RACE_NOT_FOUND',
        `Racing race ${raceId} is not the current race for table ${table.tableId}.`,
      );
    }

    if (table.phase !== 'BETTING') {
      throw new RacingTableError(
        'BETTING_CLOSED',
        `Racing table ${table.tableId} is not accepting bets.`,
      );
    }

    return table.race;
  }

  recordBetPlaced(input: RacingRecordBetPlacedInput): RacingTableMutationResult {
    const table = this.getTable(input.tableId);
    const user = normalizeSocketUser(input.user);

    this.bump(table);

    return {
      state: this.toState(table),
      event: this.toEvent(table, 'BET_PLACED', user.userId, {
        raceId: input.raceId,
        betId: input.betId,
        betType: input.betType,
        raceEntryIds: input.raceEntryIds,
      }),
    };
  }

  recordRaceTick(input: RacingRecordRaceTickInput): RacingTableMutationResult {
    const table = this.getTable(input.tableId);

    if (!table.race || table.race.raceId !== input.tick.raceId) {
      throw new RacingTableError(
        'RACE_NOT_FOUND',
        `Racing race ${input.tick.raceId} is not active.`,
      );
    }

    if (table.phase !== 'RUNNING') {
      throw new RacingTableError(
        'BETTING_CLOSED',
        `Racing table ${table.tableId} is not running a race.`,
      );
    }

    this.bump(table);

    return {
      state: this.toState(table),
      event: this.toEvent(table, 'RACE_TICK', 'SYSTEM', {
        raceId: input.tick.raceId,
        tick: input.tick,
      }),
    };
  }

  disconnectSocket(socketId: string): RacingTableMutationResult[] {
    const updates: RacingTableMutationResult[] = [];

    for (const table of this.tables.values()) {
      const user = table.connections.get(socketId);

      if (!user) {
        continue;
      }

      table.connections.delete(socketId);
      this.bump(table);
      updates.push({
        state: this.toState(table),
        event: this.toEvent(table, 'PLAYER_DISCONNECTED', user.userId),
      });
    }

    return updates;
  }

  getTableState(tableId: string): RacingTableState {
    return this.toState(this.getTable(tableId));
  }

  getTableSummary(tableId: string): RacingTableSummary {
    const table = this.getTable(tableId);
    const state = this.toState(table);

    return {
      tableId: state.tableId,
      gameType: 'RACING',
      status: state.status,
      phase: state.phase,
      fieldSize: state.fieldSize,
      viewerCount: state.viewerCount,
      bettingLimits: state.bettingLimits,
      betTypes: state.betTypes,
      timing: state.timing,
      race: state.race,
      timers: state.timers,
      version: state.version,
      updatedAt: state.updatedAt,
    };
  }

  private getTable(tableId: string) {
    const normalizedTableId = normalizeTableId(tableId);
    const table = this.tables.get(normalizedTableId);

    if (!table) {
      throw new RacingTableError(
        'TABLE_NOT_FOUND',
        `Racing table ${normalizedTableId} is not configured.`,
      );
    }

    return table;
  }

  private createRuntimeTable(
    tableId: string,
    config: RacingTableConfig,
    race: RacingRaceSnapshot | null,
  ): RacingTableRuntime {
    const now = new Date().toISOString();

    return {
      tableId,
      ...config,
      phase: race?.phase ?? 'WAITING',
      race,
      connections: new Map(),
      version: 0,
      updatedAt: now,
    };
  }

  private applyTableConfig(
    table: RacingTableRuntime,
    config: RacingTableConfig,
    race: RacingRaceSnapshot | null,
  ) {
    table.status = config.status;
    table.fieldSize = config.fieldSize;
    table.minBet = config.minBet;
    table.maxBet = config.maxBet;
    table.payoutRateBps = config.payoutRateBps;
    table.bettingTimeoutSeconds = config.bettingTimeoutSeconds;
    table.raceIntervalSeconds = config.raceIntervalSeconds;
    table.bettingCloseBeforeStartSeconds =
      config.bettingCloseBeforeStartSeconds;
    table.tickIntervalMs = config.tickIntervalMs;
    table.raceDistanceM = config.raceDistanceM;
    table.roundEndDelaySeconds = config.roundEndDelaySeconds;
    table.betTypes = config.betTypes;
    table.horses = config.horses;
    table.race = race;
    table.phase = race?.phase ?? 'WAITING';
  }

  private bump(table: RacingTableRuntime) {
    table.version += 1;
    table.updatedAt = new Date().toISOString();
  }

  private toState(table: RacingTableRuntime): RacingTableState {
    return {
      tableId: table.tableId,
      status: table.status,
      phase: table.phase,
      fieldSize: table.fieldSize,
      viewerCount: countUniqueViewers(table),
      bettingLimits: {
        minBet: table.minBet.toString(),
        maxBet: table.maxBet.toString(),
      },
      betTypes: table.betTypes,
      timing: {
        bettingTimeoutSeconds: table.bettingTimeoutSeconds,
        raceIntervalSeconds: table.raceIntervalSeconds,
        raceAndResultSeconds: calculateRaceAndResultSeconds(table),
        bettingCloseBeforeStartSeconds:
          table.bettingCloseBeforeStartSeconds,
        tickIntervalMs: table.tickIntervalMs,
        raceDistanceM: table.raceDistanceM,
        roundEndDelaySeconds: table.roundEndDelaySeconds,
      },
      horses: table.horses,
      race: table.race,
      timers: {
        scheduledStartAt: table.race?.scheduledStartAt ?? null,
        bettingClosesAt: table.race?.bettingClosesAt ?? null,
      },
      version: table.version,
      updatedAt: table.updatedAt,
    };
  }

  private toEvent(
    table: RacingTableRuntime,
    type: RacingTableEventPayload['type'],
    actorUserId: string,
    metadata: RacingTableEventMetadata = {},
  ): RacingTableEventPayload {
    return {
      tableId: table.tableId,
      type,
      actorUserId,
      ...metadata,
      stateVersion: table.version,
      createdAt: table.updatedAt,
    };
  }
}

export class RacingTableError extends Error {
  constructor(
    readonly code: RacingSocketErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RacingTableError';
  }
}

type RacingTableRuntime = RacingTableConfig & {
  tableId: string;
  phase: RacingTablePhase;
  race: RacingRaceSnapshot | null;
  connections: Map<string, RacingSocketUser>;
  version: number;
  updatedAt: string;
};

type RacingTableEventMetadata = Pick<
  RacingTableEventPayload,
  'raceId' | 'betId' | 'betType' | 'raceEntryIds' | 'resultOrder' | 'tick'
>;

function normalizeTableId(tableId: string) {
  const normalizedTableId = tableId.trim();

  if (!normalizedTableId) {
    throw new RacingTableError('INVALID_TABLE_ID', 'tableId is required.');
  }

  return normalizedTableId;
}

function normalizeSocketUser(user: RacingSocketUser): RacingSocketUser {
  const userId = user.userId.trim();
  const nickname = user.nickname.trim();

  if (!userId || !nickname) {
    throw new RacingTableError(
      'INVALID_SOCKET_USER',
      'Socket user requires userId and nickname.',
    );
  }

  return {
    userId,
    nickname,
    role: user.role,
  };
}

function normalizeTableConfig(config: RacingTableConfig): RacingTableConfig {
  if (!Number.isInteger(config.fieldSize) || config.fieldSize < 2) {
    throw new RacingTableError(
      'UNKNOWN_ERROR',
      'Racing fieldSize must be an integer greater than or equal to 2.',
    );
  }

  if (config.minBet <= 0n || config.maxBet < config.minBet) {
    throw new RacingTableError(
      'UNKNOWN_ERROR',
      'Racing betting limits are invalid.',
    );
  }

  if (
    config.bettingTimeoutSeconds + config.bettingCloseBeforeStartSeconds >=
    config.raceIntervalSeconds
  ) {
    throw new RacingTableError(
      'UNKNOWN_ERROR',
      'Racing timing must leave time for race and result display.',
    );
  }

  if (config.horses.length < config.fieldSize) {
    throw new RacingTableError(
      'UNKNOWN_ERROR',
      'Racing table does not have enough active horses.',
    );
  }

  return {
    ...config,
    status: normalizeTableStatus(config.status),
    horses: config.horses.slice(0, config.fieldSize),
    betTypes: normalizeBetTypes(config.betTypes),
  };
}

function normalizeTableStatus(status: RacingTableStatus): RacingTableStatus {
  if (status === 'OPEN' || status === 'MAINTENANCE' || status === 'CLOSED') {
    return status;
  }

  throw new RacingTableError(
    'UNKNOWN_ERROR',
    `Unsupported racing table status ${String(status)}.`,
  );
}

function normalizeBetTypes(betTypes: RacingBetType[]) {
  const uniqueBetTypes = Array.from(new Set(betTypes));

  if (
    uniqueBetTypes.length === 0 ||
    uniqueBetTypes.some((betType) => !racingBetTypes.has(betType))
  ) {
    throw new RacingTableError(
      'UNKNOWN_ERROR',
      'Racing table has invalid bet types.',
    );
  }

  return uniqueBetTypes;
}

function countUniqueViewers(table: RacingTableRuntime) {
  return new Set(
    Array.from(table.connections.values()).map((user) => user.userId),
  ).size;
}

function buildSyncKey(table: RacingTableRuntime) {
  return JSON.stringify({
    status: table.status,
    phase: table.phase,
    fieldSize: table.fieldSize,
    minBet: table.minBet.toString(),
    maxBet: table.maxBet.toString(),
    payoutRateBps: table.payoutRateBps,
    bettingTimeoutSeconds: table.bettingTimeoutSeconds,
    raceIntervalSeconds: table.raceIntervalSeconds,
    bettingCloseBeforeStartSeconds: table.bettingCloseBeforeStartSeconds,
    tickIntervalMs: table.tickIntervalMs,
    raceDistanceM: table.raceDistanceM,
    roundEndDelaySeconds: table.roundEndDelaySeconds,
    betTypes: table.betTypes,
    horses: table.horses.map((horse) => horse.horseId),
    race: table.race
      ? {
          raceId: table.race.raceId,
          raceNo: table.race.raceNo,
          status: table.race.status,
          phase: table.race.phase,
          scheduledStartAt: table.race.scheduledStartAt,
          bettingOpensAt: table.race.bettingOpensAt,
          bettingClosesAt: table.race.bettingClosesAt,
          startedAt: table.race.startedAt,
          finishedAt: table.race.finishedAt,
          settledAt: table.race.settledAt,
          resultOrder: table.race.resultOrder,
          entries: table.race.entries.map((entry) => entry.raceEntryId),
        }
      : null,
  });
}

function getSyncEventType(
  previousKey: string,
  table: RacingTableRuntime,
): RacingTableEventPayload['type'] {
  const previous = JSON.parse(previousKey) as {
    race?: {
      raceId?: string;
      phase?: RacingTablePhase;
    } | null;
  };
  const previousRace = previous.race;
  const nextRace = table.race;

  if (!previousRace || !nextRace || previousRace.raceId !== nextRace.raceId) {
    return 'RACE_SCHEDULED';
  }

  if (previousRace.phase !== nextRace.phase) {
    if (nextRace.phase === 'RUNNING') {
      return 'RACE_STARTED';
    }

    if (nextRace.phase === 'SETTLED') {
      return 'RACE_SETTLED';
    }
  }

  return 'RACE_SCHEDULED';
}

function calculateRaceAndResultSeconds(table: RacingTableRuntime) {
  return (
    table.raceIntervalSeconds -
    table.bettingTimeoutSeconds -
    table.bettingCloseBeforeStartSeconds
  );
}

const racingBetTypes = new Set<RacingBetType>(['WIN', 'QUINELLA', 'EXACTA']);
