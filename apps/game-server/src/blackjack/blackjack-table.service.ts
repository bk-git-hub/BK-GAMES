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
    table.phase = 'WAITING_BETS';
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

    if (currentSeat.bet || currentSeat.pendingBet) {
      throw new BlackjackTableError(
        'SEAT_HAS_ACTIVE_BET',
        `Seat ${seatNo} has an active bet.`,
      );
    }

    table.seats.delete(seatNo);

    if (table.seats.size === 0) {
      table.phase = 'WAITING';
    }

    this.bump(table);

    return {
      state: this.toState(table),
      event: this.toEvent(table, 'SEAT_LEFT', user.userId, seatNo),
    };
  }

  reserveBet(input: BlackjackReserveBetInput): BlackjackBetReservation {
    const table = this.getOrCreateTable(input.tableId);
    const user = normalizeSocketUser(input.user);
    const seatNo = normalizeSeatNo(input.seatNo, table.maxSeats);
    const amount = normalizePointAmount(input.amount);
    const commandId = normalizeCommandId(input.commandId);
    const seat = table.seats.get(seatNo);

    table.connections.set(input.socketId, user);

    if (table.phase !== 'WAITING_BETS') {
      throw new BlackjackTableError(
        'BETTING_CLOSED',
        `Table ${table.tableId} is not accepting bets.`,
      );
    }

    if (!seat) {
      throw new BlackjackTableError(
        'SEAT_NOT_OCCUPIED',
        `Seat ${seatNo} is not occupied.`,
      );
    }

    if (seat.userId !== user.userId) {
      throw new BlackjackTableError(
        'SEAT_NOT_OWNED',
        `User ${user.userId} does not own seat ${seatNo}.`,
      );
    }

    if (seat.bet) {
      if (betMatches(seat.bet, { userId: user.userId, amount, commandId })) {
        return {
          kind: 'already-confirmed',
          tableId: table.tableId,
          seatNo,
          amount,
          commandId,
        };
      }

      throw new BlackjackTableError(
        'BET_ALREADY_PLACED',
        `Seat ${seatNo} already has a bet.`,
      );
    }

    if (seat.pendingBet) {
      throw new BlackjackTableError(
        'BET_IN_PROGRESS',
        `Seat ${seatNo} already has a bet in progress.`,
      );
    }

    assertAmountWithinRuntimeLimits(table, user.userId, amount);

    seat.pendingBet = {
      userId: user.userId,
      amount,
      commandId,
    };
    this.bump(table);

    return {
      kind: 'reserved',
      tableId: table.tableId,
      seatNo,
      amount,
      commandId,
    };
  }

  confirmBet(input: BlackjackConfirmBetInput): BlackjackTableMutationResult {
    const table = this.getOrCreateTable(input.tableId);
    const user = normalizeSocketUser(input.user);
    const seatNo = normalizeSeatNo(input.seatNo, table.maxSeats);
    const amount = normalizePointAmount(input.amount);
    const commandId = normalizeCommandId(input.commandId);
    const seat = table.seats.get(seatNo);

    if (!seat) {
      throw new BlackjackTableError(
        'SEAT_NOT_OCCUPIED',
        `Seat ${seatNo} is not occupied.`,
      );
    }

    if (seat.userId !== user.userId) {
      throw new BlackjackTableError(
        'SEAT_NOT_OWNED',
        `User ${user.userId} does not own seat ${seatNo}.`,
      );
    }

    if (seat.bet) {
      if (betMatches(seat.bet, { userId: user.userId, amount, commandId })) {
        return {
          state: this.toState(table),
          event: this.toEvent(table, 'BET_PLACED', user.userId, seatNo),
        };
      }

      throw new BlackjackTableError(
        'BET_ALREADY_PLACED',
        `Seat ${seatNo} already has a bet.`,
      );
    }

    if (
      !seat.pendingBet ||
      !betMatches(seat.pendingBet, { userId: user.userId, amount, commandId })
    ) {
      throw new BlackjackTableError(
        'BET_IN_PROGRESS',
        `Seat ${seatNo} does not have a matching bet reservation.`,
      );
    }

    seat.bet = {
      userId: user.userId,
      amount,
      commandId,
      roundId: input.roundId,
      roundSeatId: input.roundSeatId,
    };
    seat.pendingBet = undefined;
    this.bump(table);

    return {
      state: this.toState(table),
      event: this.toEvent(table, 'BET_PLACED', user.userId, seatNo),
    };
  }

  cancelBetReservation(input: BlackjackCancelBetReservationInput) {
    const table = this.getOrCreateTable(input.tableId);
    const seatNo = normalizeSeatNo(input.seatNo, table.maxSeats);
    const commandId = normalizeCommandId(input.commandId);
    const seat = table.seats.get(seatNo);

    if (
      seat?.pendingBet &&
      seat.pendingBet.commandId === commandId &&
      seat.pendingBet.amount === input.amount
    ) {
      seat.pendingBet = undefined;
      this.bump(table);
    }
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
      minInitialBet: 100n,
      maxInitialBet: 6_000n,
      maxTotalBetPerSeat: 24_000n,
      maxTotalBetPerUser: 42_000n,
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
            betAmount: seat.bet?.amount.toString() ?? null,
          }),
        ),
      bettingLimits: {
        minInitialBet: table.minInitialBet.toString(),
        maxInitialBet: table.maxInitialBet.toString(),
        maxTotalBetPerSeat: table.maxTotalBetPerSeat.toString(),
        maxTotalBetPerUser: table.maxTotalBetPerUser.toString(),
      },
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

export type BlackjackReserveBetInput = BlackjackJoinTableInput & {
  seatNo: number;
  amount: bigint;
  commandId: string;
};

export type BlackjackConfirmBetInput = BlackjackReserveBetInput & {
  roundId: string;
  roundSeatId: string;
};

export type BlackjackCancelBetReservationInput = {
  tableId: string;
  seatNo: number;
  amount: bigint;
  commandId: string;
};

export type BlackjackBetReservation = {
  kind: 'reserved' | 'already-confirmed';
  tableId: string;
  seatNo: number;
  amount: bigint;
  commandId: string;
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
  minInitialBet: bigint;
  maxInitialBet: bigint;
  maxTotalBetPerSeat: bigint;
  maxTotalBetPerUser: bigint;
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
  pendingBet?: BlackjackPendingBetRuntime;
  bet?: BlackjackBetRuntime;
};

type BlackjackPendingBetRuntime = {
  userId: string;
  amount: bigint;
  commandId: string;
};

type BlackjackBetRuntime = BlackjackPendingBetRuntime & {
  roundId: string;
  roundSeatId: string;
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

function normalizePointAmount(amount: bigint) {
  if (amount <= 0n) {
    throw new BlackjackTableError(
      'INVALID_BET_AMOUNT',
      'Bet amount must be positive.',
    );
  }

  return amount;
}

function normalizeCommandId(commandId: string) {
  const normalizedCommandId = commandId.trim();

  if (!normalizedCommandId) {
    throw new BlackjackTableError(
      'INVALID_COMMAND_ID',
      'commandId is required.',
    );
  }

  return normalizedCommandId;
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

function assertAmountWithinRuntimeLimits(
  table: BlackjackTableRuntime,
  userId: string,
  amount: bigint,
) {
  if (amount < table.minInitialBet) {
    throw new BlackjackTableError(
      'BET_TOO_LOW',
      `Bet amount must be at least ${table.minInitialBet}.`,
    );
  }

  if (amount > table.maxInitialBet || amount > table.maxTotalBetPerSeat) {
    throw new BlackjackTableError(
      'BET_TOO_HIGH',
      `Bet amount must not exceed ${table.maxInitialBet}.`,
    );
  }

  const activeUserBetTotal = Array.from(table.seats.values()).reduce(
    (total, seat) =>
      seat.userId === userId && seat.bet ? total + seat.bet.amount : total,
    0n,
  );

  if (activeUserBetTotal + amount > table.maxTotalBetPerUser) {
    throw new BlackjackTableError(
      'BET_TOO_HIGH',
      `Total user wager must not exceed ${table.maxTotalBetPerUser}.`,
    );
  }
}

function betMatches(
  bet: BlackjackPendingBetRuntime,
  input: {
    userId: string;
    amount: bigint;
    commandId: string;
  },
) {
  return (
    bet.userId === input.userId &&
    bet.amount === input.amount &&
    bet.commandId === input.commandId
  );
}

function hasConnectedUser(table: BlackjackTableRuntime, userId: string) {
  return Array.from(table.connections.values()).some(
    (user) => user.userId === userId,
  );
}
