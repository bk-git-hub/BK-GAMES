import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  createDeck,
  evaluateHand,
  getAvailablePlayerActions,
  shouldDealerHit,
  shuffleDeck,
  type BlackjackCard,
  type BlackjackPlayerAction as BlackjackEnginePlayerAction,
  type RandomSource,
} from './blackjack-engine.port';
import {
  type BlackjackCardSnapshot,
  type BlackjackHandOutcome,
  type BlackjackHandOutcomeReason,
  type BlackjackHandStatus,
  type BlackjackPlayerAction as BlackjackSocketPlayerAction,
  type BlackjackSeatSnapshot,
  type BlackjackSocketErrorCode,
  type BlackjackSocketUser,
  type BlackjackTableEventPayload,
  type BlackjackTablePhase,
  type BlackjackTableState,
  type BlackjackTableStatus,
} from '@bk-games/shared';

export const BLACKJACK_TABLE_OPTIONS = 'BLACKJACK_TABLE_OPTIONS';

export type BlackjackTableOptions = {
  deckCount?: number;
  dealerHitsSoft17?: boolean;
  randomSource?: RandomSource;
  nowSource?: () => Date;
  bettingWindowMs?: number;
};

@Injectable()
export class BlackjackTableService {
  private readonly tables = new Map<string, BlackjackTableRuntime>();
  private readonly deckCount: number;
  private readonly dealerHitsSoft17: boolean;
  private readonly randomSource: RandomSource;
  private readonly nowSource: () => Date;
  private readonly bettingWindowMs: number;

  constructor(
    @Optional()
    @Inject(BLACKJACK_TABLE_OPTIONS)
    options?: BlackjackTableOptions,
  ) {
    this.deckCount = normalizeDeckCount(options?.deckCount ?? 6);
    this.dealerHitsSoft17 = options?.dealerHitsSoft17 ?? false;
    this.randomSource = options?.randomSource ?? Math.random;
    this.nowSource = options?.nowSource ?? (() => new Date());
    this.bettingWindowMs = normalizeBettingWindowMs(
      options?.bettingWindowMs ?? 20_000,
    );
  }

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

    if (table.phase !== 'WAITING' && table.phase !== 'WAITING_BETS') {
      throw new BlackjackTableError(
        'BETTING_CLOSED',
        `Table ${table.tableId} is not accepting new seats.`,
      );
    }

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

    if (currentSeat) {
      currentSeat.nickname = user.nickname;
      currentSeat.status = 'OCCUPIED';
    } else {
      table.seats.set(seatNo, {
        seatNo,
        userId: user.userId,
        nickname: user.nickname,
        status: 'OCCUPIED',
      });
    }
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

    if (
      table.phase !== 'WAITING_BETS' ||
      isBettingWindowExpired(table, this.now())
    ) {
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
    this.ensureBettingWindow(table);
    const roundStarted = isBettingWindowExpired(table, this.now())
      ? this.maybeStartRound(table)
      : false;
    this.bump(table);

    return {
      state: this.toState(table),
      event: this.toEvent(
        table,
        roundStarted ? 'ROUND_STARTED' : 'BET_PLACED',
        user.userId,
        seatNo,
      ),
      settlement: this.buildSettlementRequestIfReady(table),
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

  playerAction(
    input: BlackjackPlayerActionInput,
  ): BlackjackTableMutationResult {
    const table = this.getOrCreateTable(input.tableId);
    const user = normalizeSocketUser(input.user);
    const seatNo = normalizeSeatNo(input.seatNo, table.maxSeats);
    const action = normalizePlayerAction(input.action);
    const seat = table.seats.get(seatNo);

    table.connections.set(input.socketId, user);

    if (!table.round || table.phase !== 'PLAYER_TURNS') {
      throw new BlackjackTableError(
        'ROUND_NOT_ACTIVE',
        `Table ${table.tableId} does not have an active player turn.`,
      );
    }

    if (!seat?.hand) {
      throw new BlackjackTableError(
        'SEAT_NOT_OCCUPIED',
        `Seat ${seatNo} does not have an active hand.`,
      );
    }

    if (seat.userId !== user.userId) {
      throw new BlackjackTableError(
        'SEAT_NOT_OWNED',
        `User ${user.userId} does not own seat ${seatNo}.`,
      );
    }

    if (table.round.currentTurnSeatNo !== seatNo) {
      throw new BlackjackTableError(
        'NOT_YOUR_TURN',
        `Seat ${seatNo} is not the current turn.`,
      );
    }

    const availableActions = this.getAvailableSeatActions(table, seat);

    if (!availableActions.includes(action)) {
      throw new BlackjackTableError(
        'ACTION_NOT_ALLOWED',
        `${action} is not available for seat ${seatNo}.`,
      );
    }

    if (action === 'HIT') {
      seat.hand.cards.push(drawCard(table));
      const hand = evaluateHand(seat.hand.cards);

      if (hand.isBust) {
        seat.hand.status = 'BUSTED';
      } else if (hand.total === 21) {
        seat.hand.status = 'STOOD';
      }
    } else {
      seat.hand.status = 'STOOD';
    }

    const dealerPlayed = this.advanceTurnOrPlayDealer(table);
    this.bump(table);

    return {
      state: this.toState(table),
      event: this.toEvent(
        table,
        dealerPlayed ? 'DEALER_PLAYED' : 'PLAYER_ACTED',
        user.userId,
        seatNo,
      ),
      settlement: this.buildSettlementRequestIfReady(table),
    };
  }

  confirmSettlement(
    input: BlackjackConfirmSettlementInput,
  ): BlackjackTableMutationResult {
    const table = this.getOrCreateTable(input.tableId);

    if (!table.round || table.round.roundId !== input.roundId) {
      throw new BlackjackTableError(
        'ROUND_NOT_ACTIVE',
        `Round ${input.roundId} is not active on table ${table.tableId}.`,
      );
    }

    for (const settlement of input.seats) {
      const seat = table.seats.get(settlement.seatNo);

      if (
        !seat?.hand ||
        !seat.bet ||
        seat.bet.roundSeatId !== settlement.roundSeatId
      ) {
        throw new BlackjackTableError(
          'ROUND_SEAT_NOT_FOUND',
          `Round seat ${settlement.roundSeatId} is not active on table ${table.tableId}.`,
        );
      }

      seat.hand.outcome = settlement.outcome;
      seat.hand.outcomeReason = settlement.outcomeReason;
      seat.hand.payoutAmount = settlement.payoutAmount;
      seat.hand.netAmount = settlement.netAmount;
    }

    table.phase = 'SETTLED';
    table.round.currentTurnSeatNo = null;
    this.bump(table);

    return {
      state: this.toState(table),
      event: this.toEvent(table, 'ROUND_SETTLED', 'system'),
    };
  }

  expireBettingWindow(
    input: BlackjackExpireBettingWindowInput,
  ): BlackjackTableMutationResult | null {
    const table = this.getOrCreateTable(input.tableId);
    const now = input.now ?? this.now();

    if (
      table.phase !== 'WAITING_BETS' ||
      !table.bettingClosesAt ||
      now < table.bettingClosesAt
    ) {
      return null;
    }

    const roundStarted = this.maybeStartRound(table);

    if (!roundStarted) {
      return null;
    }

    this.bump(table);

    return {
      state: this.toState(table),
      event: this.toEvent(table, 'ROUND_STARTED', 'system'),
      settlement: this.buildSettlementRequestIfReady(table),
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

    const now = this.now().toISOString();
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
      deckCount: this.deckCount,
      dealerHitsSoft17: this.dealerHitsSoft17,
      shoe: [],
      bettingClosesAt: undefined,
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
    table.updatedAt = this.now().toISOString();
  }

  private toState(table: BlackjackTableRuntime): BlackjackTableState {
    return {
      tableId: table.tableId,
      status: table.status,
      phase: table.phase,
      seats: Array.from(table.seats.values())
        .sort((left, right) => left.seatNo - right.seatNo)
        .map((seat): BlackjackSeatSnapshot => this.toSeatSnapshot(table, seat)),
      bettingLimits: {
        minInitialBet: table.minInitialBet.toString(),
        maxInitialBet: table.maxInitialBet.toString(),
        maxTotalBetPerSeat: table.maxTotalBetPerSeat.toString(),
        maxTotalBetPerUser: table.maxTotalBetPerUser.toString(),
      },
      dealer: this.toDealerSnapshot(table),
      round: table.round
        ? {
            roundId: table.round.roundId,
            currentTurnSeatNo: table.round.currentTurnSeatNo,
          }
        : null,
      timers: {
        phaseEndsAt:
          table.phase === 'WAITING_BETS'
            ? (table.bettingClosesAt?.toISOString() ?? null)
            : null,
        turnEndsAt: null,
      },
      version: table.version,
      updatedAt: table.updatedAt,
    };
  }

  private toSeatSnapshot(
    table: BlackjackTableRuntime,
    seat: BlackjackSeatRuntime,
  ): BlackjackSeatSnapshot {
    const hand = seat.hand ? evaluateHand(seat.hand.cards) : null;

    return {
      seatNo: seat.seatNo,
      userId: seat.userId,
      nickname: seat.nickname,
      status: seat.status,
      connected: hasConnectedUser(table, seat.userId),
      betAmount: seat.bet?.amount.toString() ?? null,
      handStatus: this.toSeatHandStatus(seat),
      cards: seat.hand?.cards.map((card) => toCardSnapshot(card)) ?? [],
      score: hand?.total ?? null,
      isSoft: hand?.isSoft ?? false,
      isCurrentTurn: table.round?.currentTurnSeatNo === seat.seatNo,
      availableActions: this.getAvailableSeatActions(table, seat),
      outcome: seat.hand?.outcome ?? null,
      outcomeReason: seat.hand?.outcomeReason ?? null,
      payoutAmount: seat.hand?.payoutAmount?.toString() ?? null,
      netAmount: seat.hand?.netAmount?.toString() ?? null,
    };
  }

  private toDealerSnapshot(table: BlackjackTableRuntime) {
    if (!table.round || table.round.dealerCards.length === 0) {
      return { cards: [], visibleScore: null, score: null };
    }

    const dealerCardsAreHidden = table.phase === 'PLAYER_TURNS';
    const cards = table.round.dealerCards.map((card, index) =>
      toCardSnapshot(card, dealerCardsAreHidden && index > 0),
    );
    const visibleCards = dealerCardsAreHidden
      ? table.round.dealerCards.slice(0, 1)
      : table.round.dealerCards;
    const visibleScore =
      visibleCards.length > 0 ? evaluateHand(visibleCards).total : null;

    return {
      cards,
      visibleScore,
      score: dealerCardsAreHidden
        ? null
        : evaluateHand(table.round.dealerCards).total,
    };
  }

  private toSeatHandStatus(seat: BlackjackSeatRuntime): BlackjackHandStatus {
    if (seat.hand) {
      return seat.hand.status;
    }

    if (seat.bet) {
      return 'BET_PLACED';
    }

    return 'WAITING_BET';
  }

  private ensureBettingWindow(table: BlackjackTableRuntime) {
    if (table.bettingClosesAt) {
      return;
    }

    table.bettingClosesAt = new Date(
      this.now().getTime() + this.bettingWindowMs,
    );
  }

  private maybeStartRound(table: BlackjackTableRuntime) {
    if (table.phase !== 'WAITING_BETS' || table.round) {
      return false;
    }

    const seats = this.getSortedOccupiedSeats(table);
    const betSeats = seats.filter(hasConfirmedBet);

    if (betSeats.length === 0) {
      return false;
    }

    const roundId = betSeats[0]?.bet?.roundId;

    if (!roundId) {
      return false;
    }

    table.phase = 'DEALING';
    table.shoe = this.createShuffledShoe(table);
    table.bettingClosesAt = undefined;
    table.round = {
      roundId,
      currentTurnSeatNo: null,
      dealerCards: [],
    };

    for (const seat of seats) {
      if (!seat.bet) {
        seat.status = 'SITTING_OUT';
      }
    }

    for (const seat of betSeats) {
      seat.hand = { cards: [drawCard(table)], status: 'PLAYING' };
    }

    table.round.dealerCards.push(drawCard(table));

    for (const seat of betSeats) {
      seat.hand?.cards.push(drawCard(table));
    }

    table.round.dealerCards.push(drawCard(table));

    for (const seat of betSeats) {
      if (!seat.hand) {
        continue;
      }

      if (evaluateHand(seat.hand.cards).isBlackjack) {
        seat.hand.status = 'BLACKJACK';
      }
    }

    this.advanceTurnOrPlayDealer(table);

    return true;
  }

  private advanceTurnOrPlayDealer(table: BlackjackTableRuntime) {
    if (!table.round) {
      return false;
    }

    const nextSeat = this.getSortedOccupiedSeats(table).find(
      (seat) => seat.hand?.status === 'PLAYING',
    );

    if (nextSeat) {
      table.phase = 'PLAYER_TURNS';
      table.round.currentTurnSeatNo = nextSeat.seatNo;
      return false;
    }

    this.playDealer(table);
    return true;
  }

  private playDealer(table: BlackjackTableRuntime) {
    if (!table.round) {
      return;
    }

    table.phase = 'DEALER_TURN';
    table.round.currentTurnSeatNo = null;

    while (
      shouldDealerHit(table.round.dealerCards, {
        dealerHitsSoft17: table.dealerHitsSoft17,
      })
    ) {
      table.round.dealerCards.push(drawCard(table));
    }

    table.phase = 'SETTLING';
  }

  private getAvailableSeatActions(
    table: BlackjackTableRuntime,
    seat: BlackjackSeatRuntime,
  ): BlackjackSocketPlayerAction[] {
    if (
      !table.round ||
      table.phase !== 'PLAYER_TURNS' ||
      table.round.currentTurnSeatNo !== seat.seatNo ||
      !seat.hand ||
      seat.hand.status !== 'PLAYING'
    ) {
      return [];
    }

    return getAvailablePlayerActions(
      { cards: seat.hand.cards },
      {
        doubleAllowed: false,
        splitAllowed: false,
        surrenderAllowed: false,
      },
    ).filter(isSocketPlayerAction);
  }

  private getSortedOccupiedSeats(table: BlackjackTableRuntime) {
    return Array.from(table.seats.values()).sort(
      (left, right) => left.seatNo - right.seatNo,
    );
  }

  private createShuffledShoe(table: BlackjackTableRuntime) {
    return shuffleDeck(createDeck(table.deckCount), this.randomSource);
  }

  private now() {
    return this.nowSource();
  }

  private buildSettlementRequestIfReady(
    table: BlackjackTableRuntime,
  ): BlackjackSettlementRequest | undefined {
    if (!table.round || table.phase !== 'SETTLING') {
      return undefined;
    }

    const dealerHand = evaluateHand(table.round.dealerCards);
    const seats = this.getSortedOccupiedSeats(table)
      .map((seat): BlackjackSettlementSeatRequest | null => {
        if (!seat.hand || !seat.bet) {
          return null;
        }

        const hand = evaluateHand(seat.hand.cards);
        const outcome = calculateHandOutcome(hand, dealerHand);

        return {
          roundSeatId: seat.bet.roundSeatId,
          userId: seat.userId,
          seatNo: seat.seatNo,
          cards: seat.hand.cards.map((card) => toCardSnapshot(card)),
          finalValue: hand.total,
          isSoft: hand.isSoft,
          isNaturalBlackjack: hand.isBlackjack,
          busted: hand.isBust,
          outcome: outcome.outcome,
          outcomeReason: outcome.outcomeReason,
        };
      })
      .filter(isSettlementSeatRequest);

    if (seats.length === 0) {
      return undefined;
    }

    return {
      tableId: table.tableId,
      roundId: table.round.roundId,
      dealer: {
        cards: table.round.dealerCards.map((card) => toCardSnapshot(card)),
        finalValue: dealerHand.total,
        hasBlackjack: dealerHand.isBlackjack,
        busted: dealerHand.isBust,
      },
      seats,
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
  settlement?: BlackjackSettlementRequest;
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

export type BlackjackPlayerActionInput = BlackjackJoinTableInput & {
  seatNo: number;
  action: BlackjackSocketPlayerAction;
};

export type BlackjackConfirmSettlementInput = {
  tableId: string;
  roundId: string;
  seats: BlackjackSettlementSeatResult[];
};

export type BlackjackExpireBettingWindowInput = {
  tableId: string;
  now?: Date;
};

export type BlackjackSettlementRequest = {
  tableId: string;
  roundId: string;
  dealer: {
    cards: BlackjackCardSnapshot[];
    finalValue: number;
    hasBlackjack: boolean;
    busted: boolean;
  };
  seats: BlackjackSettlementSeatRequest[];
};

export type BlackjackSettlementSeatRequest = {
  roundSeatId: string;
  userId: string;
  seatNo: number;
  cards: BlackjackCardSnapshot[];
  finalValue: number;
  isSoft: boolean;
  isNaturalBlackjack: boolean;
  busted: boolean;
  outcome: BlackjackHandOutcome;
  outcomeReason: BlackjackHandOutcomeReason;
};

export type BlackjackSettlementSeatResult = {
  roundSeatId: string;
  seatNo: number;
  outcome: BlackjackHandOutcome;
  outcomeReason: BlackjackHandOutcomeReason;
  payoutAmount: bigint;
  netAmount: bigint;
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
  deckCount: number;
  dealerHitsSoft17: boolean;
  shoe: BlackjackCard[];
  round?: BlackjackRoundRuntime;
  bettingClosesAt?: Date;
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
  hand?: BlackjackSeatHandRuntime;
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

type BlackjackSeatHandRuntime = {
  cards: BlackjackCard[];
  status: BlackjackHandStatus;
  outcome?: BlackjackHandOutcome;
  outcomeReason?: BlackjackHandOutcomeReason;
  payoutAmount?: bigint;
  netAmount?: bigint;
};

type BlackjackRoundRuntime = {
  roundId: string;
  currentTurnSeatNo: number | null;
  dealerCards: BlackjackCard[];
};

function normalizeDeckCount(deckCount: number) {
  if (!Number.isInteger(deckCount) || deckCount < 1 || deckCount > 8) {
    throw new BlackjackTableError(
      'UNKNOWN_ERROR',
      'Blackjack deckCount must be an integer between 1 and 8.',
    );
  }

  return deckCount;
}

function normalizeBettingWindowMs(bettingWindowMs: number) {
  if (!Number.isInteger(bettingWindowMs) || bettingWindowMs <= 0) {
    throw new BlackjackTableError(
      'UNKNOWN_ERROR',
      'Blackjack bettingWindowMs must be a positive integer.',
    );
  }

  return bettingWindowMs;
}

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

function normalizePlayerAction(action: unknown): BlackjackSocketPlayerAction {
  if (action !== 'HIT' && action !== 'STAND') {
    throw new BlackjackTableError(
      'ACTION_NOT_ALLOWED',
      `${String(action)} is not supported yet.`,
    );
  }

  return action;
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

function hasConfirmedBet(
  seat: BlackjackSeatRuntime,
): seat is BlackjackSeatRuntime & { bet: BlackjackBetRuntime } {
  return Boolean(seat.bet);
}

function isBettingWindowExpired(table: BlackjackTableRuntime, now: Date) {
  return Boolean(table.bettingClosesAt && now >= table.bettingClosesAt);
}

function hasConnectedUser(table: BlackjackTableRuntime, userId: string) {
  return Array.from(table.connections.values()).some(
    (user) => user.userId === userId,
  );
}

function drawCard(table: BlackjackTableRuntime) {
  const card = table.shoe.shift();

  if (!card) {
    throw new BlackjackTableError(
      'UNKNOWN_ERROR',
      `Table ${table.tableId} shoe is empty.`,
    );
  }

  return card;
}

function toCardSnapshot(
  card: BlackjackCard,
  hidden = false,
): BlackjackCardSnapshot {
  return hidden ? { ...card, hidden: true } : card;
}

function isSocketPlayerAction(
  action: BlackjackEnginePlayerAction,
): action is BlackjackSocketPlayerAction {
  return action === 'HIT' || action === 'STAND';
}

function isSettlementSeatRequest(
  seat: BlackjackSettlementSeatRequest | null,
): seat is BlackjackSettlementSeatRequest {
  return seat !== null;
}

function calculateHandOutcome(
  player: ReturnType<typeof evaluateHand>,
  dealer: ReturnType<typeof evaluateHand>,
): {
  outcome: BlackjackHandOutcome;
  outcomeReason: BlackjackHandOutcomeReason;
} {
  if (player.isBust) {
    return { outcome: 'LOSE', outcomeReason: 'PLAYER_BUST' };
  }

  if (dealer.isBlackjack && !player.isBlackjack) {
    return { outcome: 'LOSE', outcomeReason: 'DEALER_BLACKJACK' };
  }

  if (player.isBlackjack && dealer.isBlackjack) {
    return { outcome: 'PUSH', outcomeReason: 'DEALER_BLACKJACK' };
  }

  if (player.isBlackjack) {
    return { outcome: 'WIN', outcomeReason: 'NATURAL_BLACKJACK' };
  }

  if (dealer.isBust) {
    return { outcome: 'WIN', outcomeReason: 'DEALER_BUST' };
  }

  if (player.total > dealer.total) {
    return { outcome: 'WIN', outcomeReason: 'STANDARD' };
  }

  if (player.total < dealer.total) {
    return { outcome: 'LOSE', outcomeReason: 'STANDARD' };
  }

  return { outcome: 'PUSH', outcomeReason: 'STANDARD' };
}
