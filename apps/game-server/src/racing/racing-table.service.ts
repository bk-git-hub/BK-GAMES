import { Injectable } from '@nestjs/common';
import {
  type RacingBetType,
  type RacingHorseSnapshot,
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
};

export type RacingJoinTableInput = {
  tableId: string;
  socketId: string;
  user: RacingSocketUser;
};

export type RacingTableMutationResult = {
  state: RacingTableState;
  event: RacingTableEventPayload;
};

@Injectable()
export class RacingTableService {
  private readonly tables = new Map<string, RacingTableRuntime>();

  configureTable(input: RacingConfigureTableInput) {
    const tableId = normalizeTableId(input.tableId);
    const config = normalizeTableConfig(input.config);
    const existing = this.tables.get(tableId);

    if (!existing) {
      this.tables.set(tableId, this.createRuntimeTable(tableId, config));
      return;
    }

    this.applyTableConfig(existing, config);
    this.bump(existing);
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
  ): RacingTableRuntime {
    const now = new Date().toISOString();

    return {
      tableId,
      ...config,
      phase: 'WAITING',
      connections: new Map(),
      version: 0,
      updatedAt: now,
    };
  }

  private applyTableConfig(
    table: RacingTableRuntime,
    config: RacingTableConfig,
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
        bettingCloseBeforeStartSeconds:
          table.bettingCloseBeforeStartSeconds,
        tickIntervalMs: table.tickIntervalMs,
        raceDistanceM: table.raceDistanceM,
        roundEndDelaySeconds: table.roundEndDelaySeconds,
      },
      horses: table.horses,
      race: null,
      timers: {
        scheduledStartAt: null,
        bettingClosesAt: null,
      },
      version: table.version,
      updatedAt: table.updatedAt,
    };
  }

  private toEvent(
    table: RacingTableRuntime,
    type: RacingTableEventPayload['type'],
    actorUserId: string,
  ): RacingTableEventPayload {
    return {
      tableId: table.tableId,
      type,
      actorUserId,
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
  connections: Map<string, RacingSocketUser>;
  version: number;
  updatedAt: string;
};

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

const racingBetTypes = new Set<RacingBetType>(['WIN', 'QUINELLA', 'EXACTA']);
