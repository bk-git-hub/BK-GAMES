import { Injectable } from '@nestjs/common';
import {
  type BlackjackSeatSnapshot,
  type BlackjackSocketErrorCode,
  type BlackjackSocketUser,
  type BlackjackTableEventPayload,
  type BlackjackTablePhase,
  type BlackjackTableState,
  type BlackjackTableStatus,
} from '@bk-games/shared';

@Injectable()
export class BlackjackTableService {
  private readonly tables = new Map<string, BlackjackTableRuntime>();

  joinTable(input: BlackjackJoinTableInput): BlackjackTableMutationResult {
    const table = this.getOrCreateTable(input.tableId);
    const user = normalizeSocketUser(input.user);

    table.connections.set(input.socketId, user);
    this.bump(table);

    return {
      state: this.toState(table),
      event: this.toEvent(table, 'TABLE_JOINED', user.userId),
    };
  }

  takeSeat(input: BlackjackTakeSeatInput): BlackjackTableMutationResult {
    const table = this.getOrCreateTable(input.tableId);
    const user = normalizeSocketUser(input.user, input.nickname);
    const seatNo = normalizeSeatNo(input.seatNo, table.maxSeats);
    const currentSeat = table.seats.get(seatNo);

    table.connections.set(input.socketId, user);

    if (currentSeat && currentSeat.userId !== user.userId) {
      throw new BlackjackTableError(
        'SEAT_OCCUPIED',
        `Seat ${seatNo} is already occupied.`,
      );
    }

    if (!currentSeat) {
      const occupiedSeatCount = Array.from(table.seats.values()).filter(
        (seat) => seat.userId === user.userId,
      ).length;

      if (occupiedSeatCount >= table.maxSeatsPerUser) {
        throw new BlackjackTableError(
          'SEAT_LIMIT_REACHED',
          `User ${user.userId} has reached the seat limit for table ${table.tableId}.`,
        );
      }
    }

    table.seats.set(seatNo, {
      seatNo,
      userId: user.userId,
      nickname: user.nickname,
      status: 'OCCUPIED',
    });
    this.bump(table);

    return {
      state: this.toState(table),
      event: this.toEvent(table, 'SEAT_TAKEN', user.userId, seatNo),
    };
  }

  leaveSeat(input: BlackjackLeaveSeatInput): BlackjackTableMutationResult {
    const table = this.getOrCreateTable(input.tableId);
    const user = normalizeSocketUser(input.user);
    const seatNo = normalizeSeatNo(input.seatNo, table.maxSeats);
    const currentSeat = table.seats.get(seatNo);

    table.connections.set(input.socketId, user);

    if (!currentSeat) {
      throw new BlackjackTableError(
        'SEAT_NOT_OCCUPIED',
        `Seat ${seatNo} is not occupied.`,
      );
    }

    if (currentSeat.userId !== user.userId && user.role !== 'ADMIN') {
      throw new BlackjackTableError(
        'SEAT_NOT_OWNED',
        `User ${user.userId} does not own seat ${seatNo}.`,
      );
    }

    table.seats.delete(seatNo);
    this.bump(table);

    return {
      state: this.toState(table),
      event: this.toEvent(table, 'SEAT_LEFT', user.userId, seatNo),
    };
  }

  disconnectSocket(socketId: string): BlackjackTableMutationResult[] {
    const updates: BlackjackTableMutationResult[] = [];

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

  getTableState(tableId: string): BlackjackTableState {
    return this.toState(this.getOrCreateTable(tableId));
  }

  private getOrCreateTable(tableId: string): BlackjackTableRuntime {
    const normalizedTableId = normalizeTableId(tableId);
    const existing = this.tables.get(normalizedTableId);

    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const table: BlackjackTableRuntime = {
      tableId: normalizedTableId,
      status: 'OPEN',
      phase: 'WAITING',
      maxSeats: 7,
      maxSeatsPerUser: 7,
      seats: new Map(),
      connections: new Map(),
      version: 0,
      updatedAt: now,
    };

    this.tables.set(normalizedTableId, table);

    return table;
  }

  private bump(table: BlackjackTableRuntime) {
    table.version += 1;
    table.updatedAt = new Date().toISOString();
  }

  private toState(table: BlackjackTableRuntime): BlackjackTableState {
    return {
      tableId: table.tableId,
      status: table.status,
      phase: table.phase,
      seats: Array.from(table.seats.values())
        .sort((left, right) => left.seatNo - right.seatNo)
        .map(
          (seat): BlackjackSeatSnapshot => ({
            seatNo: seat.seatNo,
            userId: seat.userId,
            nickname: seat.nickname,
            status: seat.status,
            connected: hasConnectedUser(table, seat.userId),
            betAmount: null,
          }),
        ),
      dealer: { cards: [], visibleScore: null, score: null },
      round: null,
      timers: { phaseEndsAt: null, turnEndsAt: null },
      version: table.version,
      updatedAt: table.updatedAt,
    };
  }

  private toEvent(
    table: BlackjackTableRuntime,
    type: BlackjackTableEventPayload['type'],
    actorUserId: string,
    seatNo?: number,
  ): BlackjackTableEventPayload {
    return {
      tableId: table.tableId,
      type,
      actorUserId,
      seatNo,
      stateVersion: table.version,
      createdAt: table.updatedAt,
    };
  }
}

export type BlackjackTableMutationResult = {
  state: BlackjackTableState;
  event: BlackjackTableEventPayload;
};

export type BlackjackJoinTableInput = {
  tableId: string;
  socketId: string;
  user: BlackjackSocketUser;
};

export type BlackjackTakeSeatInput = BlackjackJoinTableInput & {
  seatNo: number;
  nickname?: string;
};

export type BlackjackLeaveSeatInput = BlackjackJoinTableInput & {
  seatNo: number;
};

export class BlackjackTableError extends Error {
  constructor(
    readonly code: BlackjackSocketErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BlackjackTableError';
  }
}

type BlackjackTableRuntime = {
  tableId: string;
  status: BlackjackTableStatus;
  phase: BlackjackTablePhase;
  maxSeats: number;
  maxSeatsPerUser: number;
  seats: Map<number, BlackjackSeatRuntime>;
  connections: Map<string, BlackjackSocketUser>;
  version: number;
  updatedAt: string;
};

type BlackjackSeatRuntime = {
  seatNo: number;
  userId: string;
  nickname: string;
  status: 'OCCUPIED' | 'SITTING_OUT';
};

function normalizeTableId(tableId: string) {
  const normalizedTableId = tableId.trim();

  if (!normalizedTableId) {
    throw new BlackjackTableError('INVALID_TABLE_ID', 'tableId is required.');
  }

  return normalizedTableId;
}

function normalizeSeatNo(seatNo: number, maxSeats: number) {
  if (!Number.isInteger(seatNo) || seatNo < 1 || seatNo > maxSeats) {
    throw new BlackjackTableError(
      'INVALID_SEAT_NO',
      `seatNo must be an integer between 1 and ${maxSeats}.`,
    );
  }

  return seatNo;
}

function normalizeSocketUser(
  user: BlackjackSocketUser,
  nicknameOverride?: string,
): BlackjackSocketUser {
  const userId = user.userId.trim();
  const nickname = (nicknameOverride ?? user.nickname).trim();

  if (!userId || !nickname) {
    throw new BlackjackTableError(
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

function hasConnectedUser(table: BlackjackTableRuntime, userId: string) {
  return Array.from(table.connections.values()).some(
    (user) => user.userId === userId,
  );
}
