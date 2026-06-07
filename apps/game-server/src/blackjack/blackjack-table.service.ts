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
  type BlackjackHandSnapshot,
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
  insuranceAllowed?: boolean;
  evenMoneyAllowed?: boolean;
  doubleAllowed?: boolean;
  splitAllowed?: boolean;
  doubleAfterSplitAllowed?: boolean;
  maxSplitHands?: number;
  resplitAcesAllowed?: boolean;
  hitSplitAcesAllowed?: boolean;
  surrenderMode?: BlackjackSurrenderMode;
  randomSource?: RandomSource;
  shoeFactory?: () => BlackjackCard[];
  nowSource?: () => Date;
  bettingWindowMs?: number;
};

@Injectable()
export class BlackjackTableService {
  private readonly tables = new Map<string, BlackjackTableRuntime>();
  private readonly deckCount: number;
  private readonly dealerHitsSoft17: boolean;
  private readonly insuranceAllowed: boolean;
  private readonly evenMoneyAllowed: boolean;
  private readonly doubleAllowed: boolean;
  private readonly splitAllowed: boolean;
  private readonly doubleAfterSplitAllowed: boolean;
  private readonly maxSplitHands: number;
  private readonly resplitAcesAllowed: boolean;
  private readonly hitSplitAcesAllowed: boolean;
  private readonly surrenderMode: BlackjackSurrenderMode;
  private readonly randomSource: RandomSource;
  private readonly shoeFactory?: () => BlackjackCard[];
  private readonly nowSource: () => Date;
  private readonly bettingWindowMs: number;

  constructor(
    @Optional()
    @Inject(BLACKJACK_TABLE_OPTIONS)
    options?: BlackjackTableOptions,
  ) {
    this.deckCount = normalizeDeckCount(options?.deckCount ?? 6);
    this.dealerHitsSoft17 = options?.dealerHitsSoft17 ?? false;
    this.insuranceAllowed = options?.insuranceAllowed ?? false;
    this.evenMoneyAllowed = options?.evenMoneyAllowed ?? false;
    this.doubleAllowed = options?.doubleAllowed ?? true;
    this.splitAllowed = options?.splitAllowed ?? true;
    this.doubleAfterSplitAllowed = options?.doubleAfterSplitAllowed ?? false;
    this.maxSplitHands = normalizeMaxSplitHands(options?.maxSplitHands ?? 4);
    this.resplitAcesAllowed = options?.resplitAcesAllowed ?? false;
    this.hitSplitAcesAllowed = options?.hitSplitAcesAllowed ?? false;
    this.surrenderMode = normalizeSurrenderMode(
      options?.surrenderMode ?? 'LATE',
    );
    this.randomSource = options?.randomSource ?? Math.random;
    this.shoeFactory = options?.shoeFactory;
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

  reserveDoubleDown(
    input: BlackjackReserveDoubleDownInput,
  ): BlackjackDoubleDownReservation {
    const table = this.getOrCreateTable(input.tableId);
    const user = normalizeSocketUser(input.user);
    const seatNo = normalizeSeatNo(input.seatNo, table.maxSeats);
    const commandId = normalizeCommandId(input.commandId);
    const seat = table.seats.get(seatNo);

    table.connections.set(input.socketId, user);

    if (!table.round || table.phase !== 'PLAYER_TURNS') {
      throw new BlackjackTableError(
        'ROUND_NOT_ACTIVE',
        `Table ${table.tableId} does not have an active player turn.`,
      );
    }

    const hand = seat ? this.getCurrentTurnHand(table, seat) : null;

    if (!seat?.bet || !hand) {
      throw new BlackjackTableError(
        'SEAT_NOT_OCCUPIED',
        `Seat ${seatNo} does not have an active hand.`,
      );
    }

    if (hand.doubleCommandId === commandId) {
      return {
        kind: 'already-confirmed',
        tableId: table.tableId,
        roundId: table.round.roundId,
        roundSeatId: seat.bet.roundSeatId,
        seatNo,
        handNo: hand.handNo,
        amount: hand.betAmount,
        commandId,
      };
    }

    if (hand.pendingAction) {
      if (
        hand.pendingAction.action === 'DOUBLE' &&
        hand.pendingAction.commandId === commandId
      ) {
        return {
          kind: 'reserved',
          tableId: table.tableId,
          roundId: table.round.roundId,
          roundSeatId: seat.bet.roundSeatId,
          seatNo,
          handNo: hand.handNo,
          amount: hand.betAmount,
          commandId,
        };
      }

      throw new BlackjackTableError(
        'ACTION_NOT_ALLOWED',
        `Seat ${seatNo} already has an action in progress.`,
      );
    }

    this.assertPlayerCanAct(table, seat, hand, user, seatNo, 'DOUBLE');
    hand.pendingAction = { action: 'DOUBLE', commandId };
    this.bump(table);

    return {
      kind: 'reserved',
      tableId: table.tableId,
      roundId: table.round.roundId,
      roundSeatId: seat.bet.roundSeatId,
      seatNo,
      handNo: hand.handNo,
      amount: hand.betAmount,
      commandId,
    };
  }

  confirmDoubleDown(
    input: BlackjackConfirmDoubleDownInput,
  ): BlackjackTableMutationResult {
    const table = this.getOrCreateTable(input.tableId);
    const user = normalizeSocketUser(input.user);
    const seatNo = normalizeSeatNo(input.seatNo, table.maxSeats);
    const amount = normalizePointAmount(input.amount);
    const commandId = normalizeCommandId(input.commandId);
    const seat = table.seats.get(seatNo);
    const hand = seat ? findHandByNo(seat, input.handNo) : undefined;

    if (!table.round || table.round.roundId !== input.roundId) {
      throw new BlackjackTableError(
        'ROUND_NOT_ACTIVE',
        `Round ${input.roundId} is not active on table ${table.tableId}.`,
      );
    }

    if (
      !seat ||
      !hand ||
      !seat.bet ||
      seat.bet.roundSeatId !== input.roundSeatId
    ) {
      throw new BlackjackTableError(
        'ROUND_SEAT_NOT_FOUND',
        `Round seat ${input.roundSeatId} is not active on table ${table.tableId}.`,
      );
    }

    if (seat.userId !== user.userId) {
      throw new BlackjackTableError(
        'SEAT_NOT_OWNED',
        `User ${user.userId} does not own seat ${seatNo}.`,
      );
    }

    if (hand.doubleCommandId === commandId) {
      return {
        state: this.toState(table),
        event: this.toEvent(table, 'PLAYER_ACTED', user.userId, seatNo),
        settlement: this.buildSettlementRequestIfReady(table),
      };
    }

    if (
      !hand.pendingAction ||
      hand.pendingAction.action !== 'DOUBLE' ||
      hand.pendingAction.commandId !== commandId
    ) {
      throw new BlackjackTableError(
        'ACTION_NOT_ALLOWED',
        `Seat ${seatNo} does not have a matching double down reservation.`,
      );
    }

    seat.bet.amount += amount;
    hand.betAmount += amount;
    hand.cards.push(drawCard(table));
    const evaluatedHand = evaluateHand(hand.cards);

    hand.status = evaluatedHand.isBust ? 'BUSTED' : 'DOUBLED';
    hand.doubleCommandId = commandId;
    hand.pendingAction = undefined;

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

  cancelDoubleDownReservation(input: BlackjackCancelDoubleDownInput) {
    const table = this.getOrCreateTable(input.tableId);
    const seatNo = normalizeSeatNo(input.seatNo, table.maxSeats);
    const commandId = normalizeCommandId(input.commandId);
    const seat = table.seats.get(seatNo);
    const hand = seat ? findHandByNo(seat, input.handNo) : undefined;

    if (
      hand?.pendingAction?.action === 'DOUBLE' &&
      hand.pendingAction.commandId === commandId
    ) {
      hand.pendingAction = undefined;
      this.bump(table);
    }
  }

  reserveSplit(input: BlackjackReserveSplitInput): BlackjackSplitReservation {
    const table = this.getOrCreateTable(input.tableId);
    const user = normalizeSocketUser(input.user);
    const seatNo = normalizeSeatNo(input.seatNo, table.maxSeats);
    const commandId = normalizeCommandId(input.commandId);
    const seat = table.seats.get(seatNo);

    table.connections.set(input.socketId, user);

    if (!table.round || table.phase !== 'PLAYER_TURNS') {
      throw new BlackjackTableError(
        'ROUND_NOT_ACTIVE',
        `Table ${table.tableId} does not have an active player turn.`,
      );
    }

    const hand = seat ? this.getCurrentTurnHand(table, seat) : null;

    if (!seat?.bet || !hand) {
      throw new BlackjackTableError(
        'SEAT_NOT_OCCUPIED',
        `Seat ${seatNo} does not have an active hand.`,
      );
    }

    if (hand.splitCommandId === commandId && hand.splitNewHandNo) {
      return {
        kind: 'already-confirmed',
        tableId: table.tableId,
        roundId: table.round.roundId,
        roundSeatId: seat.bet.roundSeatId,
        seatNo,
        sourceHandNo: hand.handNo,
        newHandNo: hand.splitNewHandNo,
        amount: hand.betAmount,
        commandId,
      };
    }

    if (hand.pendingAction) {
      if (
        hand.pendingAction.action === 'SPLIT' &&
        hand.pendingAction.commandId === commandId &&
        hand.pendingAction.newHandNo
      ) {
        return {
          kind: 'reserved',
          tableId: table.tableId,
          roundId: table.round.roundId,
          roundSeatId: seat.bet.roundSeatId,
          seatNo,
          sourceHandNo: hand.handNo,
          newHandNo: hand.pendingAction.newHandNo,
          amount: hand.betAmount,
          commandId,
        };
      }

      throw new BlackjackTableError(
        'ACTION_NOT_ALLOWED',
        `Seat ${seatNo} already has an action in progress.`,
      );
    }

    this.assertPlayerCanAct(table, seat, hand, user, seatNo, 'SPLIT');

    const newHandNo = nextHandNo(seat);

    hand.pendingAction = { action: 'SPLIT', commandId, newHandNo };
    this.bump(table);

    return {
      kind: 'reserved',
      tableId: table.tableId,
      roundId: table.round.roundId,
      roundSeatId: seat.bet.roundSeatId,
      seatNo,
      sourceHandNo: hand.handNo,
      newHandNo,
      amount: hand.betAmount,
      commandId,
    };
  }

  confirmSplit(
    input: BlackjackConfirmSplitInput,
  ): BlackjackTableMutationResult {
    const table = this.getOrCreateTable(input.tableId);
    const user = normalizeSocketUser(input.user);
    const seatNo = normalizeSeatNo(input.seatNo, table.maxSeats);
    const amount = normalizePointAmount(input.amount);
    const commandId = normalizeCommandId(input.commandId);
    const seat = table.seats.get(seatNo);
    const hand = seat ? findHandByNo(seat, input.sourceHandNo) : undefined;

    if (!table.round || table.round.roundId !== input.roundId) {
      throw new BlackjackTableError(
        'ROUND_NOT_ACTIVE',
        `Round ${input.roundId} is not active on table ${table.tableId}.`,
      );
    }

    if (
      !seat ||
      !hand ||
      !seat.bet ||
      seat.bet.roundSeatId !== input.roundSeatId
    ) {
      throw new BlackjackTableError(
        'ROUND_SEAT_NOT_FOUND',
        `Round seat ${input.roundSeatId} is not active on table ${table.tableId}.`,
      );
    }

    if (seat.userId !== user.userId) {
      throw new BlackjackTableError(
        'SEAT_NOT_OWNED',
        `User ${user.userId} does not own seat ${seatNo}.`,
      );
    }

    if (
      hand.splitCommandId === commandId &&
      hand.splitNewHandNo === input.newHandNo &&
      findHandByNo(seat, input.newHandNo)
    ) {
      return {
        state: this.toState(table),
        event: this.toEvent(table, 'PLAYER_ACTED', user.userId, seatNo),
        settlement: this.buildSettlementRequestIfReady(table),
      };
    }

    if (
      !hand.pendingAction ||
      hand.pendingAction.action !== 'SPLIT' ||
      hand.pendingAction.commandId !== commandId ||
      hand.pendingAction.newHandNo !== input.newHandNo
    ) {
      throw new BlackjackTableError(
        'ACTION_NOT_ALLOWED',
        `Seat ${seatNo} does not have a matching split reservation.`,
      );
    }

    if (amount !== hand.betAmount || hand.cards.length !== 2) {
      throw new BlackjackTableError(
        'ACTION_NOT_ALLOWED',
        `Hand ${hand.handNo} cannot be split with this amount.`,
      );
    }

    const [leftCard, rightCard] = hand.cards;

    if (!leftCard || !rightCard) {
      throw new BlackjackTableError(
        'ACTION_NOT_ALLOWED',
        `Hand ${hand.handNo} cannot be split without two cards.`,
      );
    }

    const splitAces = isAcePair(hand.cards);
    const newHand: BlackjackSeatHandRuntime = {
      handNo: input.newHandNo,
      cards: [rightCard, drawCard(table)],
      status: 'PLAYING',
      betAmount: amount,
      isSplitHand: true,
      isSplitAces: splitAces,
      sourceHandNo: hand.handNo,
    };

    seat.bet.amount += amount;
    hand.cards = [leftCard, drawCard(table)];
    hand.isSplitHand = true;
    hand.isSplitAces = splitAces;
    hand.splitCommandId = commandId;
    hand.splitNewHandNo = input.newHandNo;
    hand.pendingAction = undefined;

    applyPostSplitInitialStatus(hand, table);
    applyPostSplitInitialStatus(newHand, table);
    seat.hands = [...getHands(seat), newHand].sort(
      (left, right) => left.handNo - right.handNo,
    );

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

  cancelSplitReservation(input: BlackjackCancelSplitInput) {
    const table = this.getOrCreateTable(input.tableId);
    const seatNo = normalizeSeatNo(input.seatNo, table.maxSeats);
    const commandId = normalizeCommandId(input.commandId);
    const seat = table.seats.get(seatNo);
    const hand = seat ? findHandByNo(seat, input.sourceHandNo) : undefined;

    if (
      hand?.pendingAction?.action === 'SPLIT' &&
      hand.pendingAction.commandId === commandId
    ) {
      hand.pendingAction = undefined;
      this.bump(table);
    }
  }

  reserveInsurance(
    input: BlackjackReserveInsuranceInput,
  ): BlackjackInsuranceReservation {
    const table = this.getOrCreateTable(input.tableId);
    const user = normalizeSocketUser(input.user);
    const seatNo = normalizeSeatNo(input.seatNo, table.maxSeats);
    const commandId = normalizeCommandId(input.commandId);
    const seat = table.seats.get(seatNo);
    const hand = seat ? findHandByNo(seat, 1) : undefined;

    table.connections.set(input.socketId, user);

    if (!table.round || table.phase !== 'INSURANCE_DECISION') {
      throw new BlackjackTableError(
        'ROUND_NOT_ACTIVE',
        `Table ${table.tableId} is not in insurance decision phase.`,
      );
    }

    if (!seat?.bet || !hand) {
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

    if (hand.insuranceCommandId === commandId) {
      return {
        kind: 'already-confirmed',
        tableId: table.tableId,
        roundId: table.round.roundId,
        roundSeatId: seat.bet.roundSeatId,
        seatNo,
        amount: hand.insuranceBetAmount ?? hand.betAmount / 2n,
        commandId,
      };
    }

    this.assertInsuranceDecisionAvailable(table, seat, hand, 'INSURANCE');

    if (hand.pendingAction) {
      if (
        hand.pendingAction.action === 'INSURANCE' &&
        hand.pendingAction.commandId === commandId
      ) {
        return {
          kind: 'reserved',
          tableId: table.tableId,
          roundId: table.round.roundId,
          roundSeatId: seat.bet.roundSeatId,
          seatNo,
          amount: hand.betAmount / 2n,
          commandId,
        };
      }

      throw new BlackjackTableError(
        'ACTION_NOT_ALLOWED',
        `Seat ${seatNo} already has an action in progress.`,
      );
    }

    hand.pendingAction = { action: 'INSURANCE', commandId };
    this.bump(table);

    return {
      kind: 'reserved',
      tableId: table.tableId,
      roundId: table.round.roundId,
      roundSeatId: seat.bet.roundSeatId,
      seatNo,
      amount: hand.betAmount / 2n,
      commandId,
    };
  }

  confirmInsurance(
    input: BlackjackConfirmInsuranceInput,
  ): BlackjackTableMutationResult {
    const table = this.getOrCreateTable(input.tableId);
    const user = normalizeSocketUser(input.user);
    const seatNo = normalizeSeatNo(input.seatNo, table.maxSeats);
    const amount = normalizePointAmount(input.amount);
    const commandId = normalizeCommandId(input.commandId);
    const seat = table.seats.get(seatNo);
    const hand = seat ? findHandByNo(seat, 1) : undefined;

    if (!table.round || table.round.roundId !== input.roundId) {
      throw new BlackjackTableError(
        'ROUND_NOT_ACTIVE',
        `Round ${input.roundId} is not active on table ${table.tableId}.`,
      );
    }

    if (
      !seat ||
      !hand ||
      !seat.bet ||
      seat.bet.roundSeatId !== input.roundSeatId
    ) {
      throw new BlackjackTableError(
        'ROUND_SEAT_NOT_FOUND',
        `Round seat ${input.roundSeatId} is not active on table ${table.tableId}.`,
      );
    }

    if (seat.userId !== user.userId) {
      throw new BlackjackTableError(
        'SEAT_NOT_OWNED',
        `User ${user.userId} does not own seat ${seatNo}.`,
      );
    }

    if (hand.insuranceCommandId === commandId) {
      return {
        state: this.toState(table),
        event: this.toEvent(table, 'PLAYER_ACTED', user.userId, seatNo),
        settlement: this.buildSettlementRequestIfReady(table),
      };
    }

    if (
      !hand.pendingAction ||
      hand.pendingAction.action !== 'INSURANCE' ||
      hand.pendingAction.commandId !== commandId
    ) {
      throw new BlackjackTableError(
        'ACTION_NOT_ALLOWED',
        `Seat ${seatNo} does not have a matching insurance reservation.`,
      );
    }

    hand.insuranceDecision = 'ACCEPTED';
    hand.insuranceCommandId = commandId;
    hand.insuranceBetAmount = amount;
    hand.pendingAction = undefined;

    const completed = this.advanceInsuranceDecisionOrRound(table);
    this.bump(table);

    return {
      state: this.toState(table),
      event: this.toEvent(
        table,
        completed ? 'DEALER_PLAYED' : 'PLAYER_ACTED',
        user.userId,
        seatNo,
      ),
      settlement: this.buildSettlementRequestIfReady(table),
    };
  }

  cancelInsuranceReservation(input: BlackjackCancelInsuranceInput) {
    const table = this.getOrCreateTable(input.tableId);
    const seatNo = normalizeSeatNo(input.seatNo, table.maxSeats);
    const commandId = normalizeCommandId(input.commandId);
    const seat = table.seats.get(seatNo);
    const hand = seat ? findHandByNo(seat, 1) : undefined;

    if (
      hand?.pendingAction?.action === 'INSURANCE' &&
      hand.pendingAction.commandId === commandId
    ) {
      hand.pendingAction = undefined;
      this.bump(table);
    }
  }

  declineInsurance(input: BlackjackInsuranceDecisionInput) {
    const { table, user, seatNo, hand } = this.getInsuranceDecisionContext(
      input,
      'INSURANCE_DECLINE',
    );

    hand.insuranceDecision = 'DECLINED';
    hand.pendingAction = undefined;

    const completed = this.advanceInsuranceDecisionOrRound(table);
    this.bump(table);

    return {
      state: this.toState(table),
      event: this.toEvent(
        table,
        completed ? 'DEALER_PLAYED' : 'PLAYER_ACTED',
        user.userId,
        seatNo,
      ),
      settlement: this.buildSettlementRequestIfReady(table),
    };
  }

  acceptEvenMoney(input: BlackjackInsuranceDecisionInput) {
    const { table, user, seatNo, hand } = this.getInsuranceDecisionContext(
      input,
      'EVEN_MONEY',
    );
    const commandId = input.commandId
      ? normalizeCommandId(input.commandId)
      : undefined;

    if (commandId && hand.evenMoneyCommandId === commandId) {
      return {
        state: this.toState(table),
        event: this.toEvent(table, 'PLAYER_ACTED', user.userId, seatNo),
        settlement: this.buildSettlementRequestIfReady(table),
      };
    }

    hand.insuranceDecision = 'ACCEPTED';
    hand.evenMoneyAccepted = true;
    hand.evenMoneyCommandId = commandId;

    const completed = this.advanceInsuranceDecisionOrRound(table);
    this.bump(table);

    return {
      state: this.toState(table),
      event: this.toEvent(
        table,
        completed ? 'DEALER_PLAYED' : 'PLAYER_ACTED',
        user.userId,
        seatNo,
      ),
      settlement: this.buildSettlementRequestIfReady(table),
    };
  }

  playerAction(
    input: BlackjackPlayerActionInput,
  ): BlackjackTableMutationResult {
    const table = this.getOrCreateTable(input.tableId);
    const user = normalizeSocketUser(input.user);
    const seatNo = normalizeSeatNo(input.seatNo, table.maxSeats);
    const action = normalizePlayerAction(input.action);
    const seat = table.seats.get(seatNo);
    const hand = seat ? this.getCurrentTurnHand(table, seat) : null;

    table.connections.set(input.socketId, user);

    if (!table.round || table.phase !== 'PLAYER_TURNS') {
      throw new BlackjackTableError(
        'ROUND_NOT_ACTIVE',
        `Table ${table.tableId} does not have an active player turn.`,
      );
    }

    if (!seat || !hand) {
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

    if (hand.pendingAction) {
      throw new BlackjackTableError(
        'ACTION_NOT_ALLOWED',
        `Seat ${seatNo} already has an action in progress.`,
      );
    }

    const availableActions = this.getAvailableHandActions(table, seat, hand);

    if (!availableActions.includes(action)) {
      throw new BlackjackTableError(
        'ACTION_NOT_ALLOWED',
        `${action} is not available for seat ${seatNo}.`,
      );
    }

    if (action === 'DOUBLE' || action === 'SPLIT') {
      throw new BlackjackTableError(
        'ACTION_NOT_ALLOWED',
        `${action} must be confirmed through its wallet-backed flow.`,
      );
    }

    if (action === 'HIT') {
      hand.cards.push(drawCard(table));
      const evaluatedHand = evaluateHand(hand.cards);

      if (evaluatedHand.isBust) {
        hand.status = 'BUSTED';
      } else if (evaluatedHand.total === 21) {
        hand.status = 'STOOD';
      }
    } else if (action === 'SURRENDER') {
      hand.status = 'SURRENDERED';
    } else {
      hand.status = 'STOOD';
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
      const hand = seat ? findHandByNo(seat, settlement.handNo) : undefined;

      if (
        !seat ||
        !hand ||
        !seat.bet ||
        seat.bet.roundSeatId !== settlement.roundSeatId
      ) {
        throw new BlackjackTableError(
          'ROUND_SEAT_NOT_FOUND',
          `Round seat ${settlement.roundSeatId} is not active on table ${table.tableId}.`,
        );
      }

      hand.outcome = settlement.outcome;
      hand.outcomeReason = settlement.outcomeReason;
      hand.payoutAmount = settlement.payoutAmount;
      hand.netAmount = settlement.netAmount;
    }

    table.phase = 'SETTLED';
    table.round.currentTurnSeatNo = null;
    table.round.currentTurnHandNo = null;
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
      insuranceAllowed: this.insuranceAllowed,
      evenMoneyAllowed: this.evenMoneyAllowed,
      doubleAllowed: this.doubleAllowed,
      splitAllowed: this.splitAllowed,
      doubleAfterSplitAllowed: this.doubleAfterSplitAllowed,
      maxSplitHands: this.maxSplitHands,
      resplitAcesAllowed: this.resplitAcesAllowed,
      hitSplitAcesAllowed: this.hitSplitAcesAllowed,
      surrenderMode: this.surrenderMode,
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
            currentTurnHandNo: table.round.currentTurnHandNo,
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
    const hands = getHands(seat);
    const projectedHand = this.getProjectedSeatHand(table, seat);
    const evaluatedHand = projectedHand
      ? evaluateHand(projectedHand.cards)
      : null;
    const handSnapshots = hands.map((hand) =>
      this.toHandSnapshot(table, seat, hand),
    );

    return {
      seatNo: seat.seatNo,
      userId: seat.userId,
      nickname: seat.nickname,
      status: seat.status,
      connected: hasConnectedUser(table, seat.userId),
      betAmount: seat.bet?.amount.toString() ?? null,
      handStatus: this.toSeatHandStatus(seat),
      cards: projectedHand?.cards.map((card) => toCardSnapshot(card)) ?? [],
      score: evaluatedHand?.total ?? null,
      isSoft: evaluatedHand?.isSoft ?? false,
      isCurrentTurn: table.round?.currentTurnSeatNo === seat.seatNo,
      availableActions: projectedHand
        ? this.getAvailableHandActions(table, seat, projectedHand)
        : [],
      activeHandNo:
        table.round?.currentTurnSeatNo === seat.seatNo
          ? table.round.currentTurnHandNo
          : null,
      hands: handSnapshots,
      outcome: projectedHand?.outcome ?? null,
      outcomeReason: projectedHand?.outcomeReason ?? null,
      payoutAmount: projectedHand?.payoutAmount?.toString() ?? null,
      netAmount: projectedHand?.netAmount?.toString() ?? null,
    };
  }

  private toHandSnapshot(
    table: BlackjackTableRuntime,
    seat: BlackjackSeatRuntime,
    hand: BlackjackSeatHandRuntime,
  ): BlackjackHandSnapshot {
    const evaluatedHand = evaluateHand(hand.cards);

    return {
      handNo: hand.handNo,
      betAmount: hand.betAmount.toString(),
      handStatus: hand.status,
      cards: hand.cards.map((card) => toCardSnapshot(card)),
      score: evaluatedHand.total,
      isSoft: evaluatedHand.isSoft,
      isCurrentTurn: isCurrentTurnHand(table, seat, hand),
      availableActions: this.getAvailableHandActions(table, seat, hand),
      outcome: hand.outcome ?? null,
      outcomeReason: hand.outcomeReason ?? null,
      payoutAmount: hand.payoutAmount?.toString() ?? null,
      netAmount: hand.netAmount?.toString() ?? null,
    };
  }

  private toDealerSnapshot(table: BlackjackTableRuntime) {
    if (!table.round || table.round.dealerCards.length === 0) {
      return { cards: [], visibleScore: null, score: null };
    }

    const dealerCardsAreHidden =
      table.phase === 'PLAYER_TURNS' || table.phase === 'INSURANCE_DECISION';
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
    const hand = getHands(seat)[0];

    if (hand) {
      return hand.status;
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
      currentTurnHandNo: null,
      dealerCards: [],
    };

    for (const seat of seats) {
      if (!seat.bet) {
        seat.status = 'SITTING_OUT';
      }
    }

    for (const seat of betSeats) {
      seat.hands = [
        {
          handNo: 1,
          cards: [drawCard(table)],
          status: 'PLAYING',
          betAmount: seat.bet.amount,
          isSplitHand: false,
        },
      ];
    }

    table.round.dealerCards.push(drawCard(table));

    for (const seat of betSeats) {
      const hand = getHands(seat)[0];

      hand?.cards.push(drawCard(table));
    }

    table.round.dealerCards.push(drawCard(table));

    for (const seat of betSeats) {
      const hand = getHands(seat)[0];

      if (!hand) {
        continue;
      }

      if (evaluateHand(hand.cards).isBlackjack) {
        hand.status = 'BLACKJACK';
      }
    }

    if (this.maybeStartInsuranceDecision(table)) {
      return true;
    }

    if (this.maybeResolveDealerPeek(table)) {
      return true;
    }

    this.advanceTurnOrPlayDealer(table);

    return true;
  }

  private advanceTurnOrPlayDealer(table: BlackjackTableRuntime) {
    if (!table.round) {
      return false;
    }

    const nextTurn = this.getSortedOccupiedSeats(table)
      .flatMap((seat) =>
        getHands(seat).map((hand) => ({
          seat,
          hand,
        })),
      )
      .find(({ hand }) => hand.status === 'PLAYING');

    if (nextTurn) {
      table.phase = 'PLAYER_TURNS';
      table.round.currentTurnSeatNo = nextTurn.seat.seatNo;
      table.round.currentTurnHandNo = nextTurn.hand.handNo;
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
    table.round.currentTurnHandNo = null;

    while (
      shouldDealerHit(table.round.dealerCards, {
        dealerHitsSoft17: table.dealerHitsSoft17,
      })
    ) {
      table.round.dealerCards.push(drawCard(table));
    }

    table.phase = 'SETTLING';
  }

  private maybeStartInsuranceDecision(table: BlackjackTableRuntime) {
    if (!table.round || !isDealerUpcardAce(table)) {
      return false;
    }

    const firstDecision = this.getSortedOccupiedSeats(table)
      .flatMap((seat) =>
        getHands(seat).map((hand) => ({
          seat,
          hand,
        })),
      )
      .find(({ hand }) => this.getInsuranceOfferActions(table, hand).length);

    if (!firstDecision) {
      return false;
    }

    for (const seat of this.getSortedOccupiedSeats(table)) {
      for (const hand of getHands(seat)) {
        if (this.getInsuranceOfferActions(table, hand).length) {
          hand.insuranceDecision = 'PENDING';
        }
      }
    }

    table.phase = 'INSURANCE_DECISION';
    table.round.currentTurnSeatNo = firstDecision.seat.seatNo;
    table.round.currentTurnHandNo = firstDecision.hand.handNo;

    return true;
  }

  private advanceInsuranceDecisionOrRound(table: BlackjackTableRuntime) {
    if (!table.round) {
      return false;
    }

    const nextDecision = this.getSortedOccupiedSeats(table)
      .flatMap((seat) =>
        getHands(seat).map((hand) => ({
          seat,
          hand,
        })),
      )
      .find(
        ({ hand }) =>
          hand.insuranceDecision === 'PENDING' &&
          this.getInsuranceDecisionActions(table, hand).length > 0,
      );

    if (nextDecision) {
      table.phase = 'INSURANCE_DECISION';
      table.round.currentTurnSeatNo = nextDecision.seat.seatNo;
      table.round.currentTurnHandNo = nextDecision.hand.handNo;
      return false;
    }

    table.round.currentTurnSeatNo = null;
    table.round.currentTurnHandNo = null;

    if (this.maybeResolveDealerPeek(table)) {
      return true;
    }

    this.advanceTurnOrPlayDealer(table);

    return false;
  }

  private maybeResolveDealerPeek(table: BlackjackTableRuntime) {
    if (!table.round || !isDealerPeekUpcard(table)) {
      return false;
    }

    if (!evaluateHand(table.round.dealerCards).isBlackjack) {
      return false;
    }

    table.phase = 'SETTLING';
    table.round.currentTurnSeatNo = null;
    table.round.currentTurnHandNo = null;

    return true;
  }

  private getInsuranceDecisionContext(
    input: BlackjackInsuranceDecisionInput,
    action: BlackjackSocketPlayerAction,
  ) {
    const table = this.getOrCreateTable(input.tableId);
    const user = normalizeSocketUser(input.user);
    const seatNo = normalizeSeatNo(input.seatNo, table.maxSeats);
    const seat = table.seats.get(seatNo);
    const hand = seat ? findHandByNo(seat, 1) : undefined;

    table.connections.set(input.socketId, user);

    if (!table.round || table.phase !== 'INSURANCE_DECISION') {
      throw new BlackjackTableError(
        'ROUND_NOT_ACTIVE',
        `Table ${table.tableId} is not in insurance decision phase.`,
      );
    }

    if (!seat?.bet || !hand) {
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

    this.assertInsuranceDecisionAvailable(table, seat, hand, action);

    return { table, user, seatNo, seat, hand };
  }

  private assertInsuranceDecisionAvailable(
    table: BlackjackTableRuntime,
    seat: BlackjackSeatRuntime,
    hand: BlackjackSeatHandRuntime,
    action: BlackjackSocketPlayerAction,
  ) {
    if (
      !table.round ||
      table.phase !== 'INSURANCE_DECISION' ||
      table.round.currentTurnSeatNo !== seat.seatNo ||
      table.round.currentTurnHandNo !== hand.handNo
    ) {
      throw new BlackjackTableError(
        'NOT_YOUR_TURN',
        `Seat ${seat.seatNo} is not the current insurance decision.`,
      );
    }

    if (hand.pendingAction) {
      throw new BlackjackTableError(
        'ACTION_NOT_ALLOWED',
        `Seat ${seat.seatNo} already has an action in progress.`,
      );
    }

    if (!this.getInsuranceDecisionActions(table, hand).includes(action)) {
      throw new BlackjackTableError(
        'ACTION_NOT_ALLOWED',
        `${action} is not available for seat ${seat.seatNo}.`,
      );
    }
  }

  private getInsuranceDecisionActions(
    table: BlackjackTableRuntime,
    hand: BlackjackSeatHandRuntime,
  ): BlackjackSocketPlayerAction[] {
    if (
      !table.round ||
      table.phase !== 'INSURANCE_DECISION' ||
      hand.insuranceDecision !== 'PENDING'
    ) {
      return [];
    }

    return this.getInsuranceOfferActions(table, hand);
  }

  private getInsuranceOfferActions(
    table: BlackjackTableRuntime,
    hand: BlackjackSeatHandRuntime,
  ): BlackjackSocketPlayerAction[] {
    const handValue = evaluateHand(hand.cards);

    if (handValue.isBlackjack && table.evenMoneyAllowed) {
      return ['EVEN_MONEY', 'INSURANCE_DECLINE'];
    }

    if (table.insuranceAllowed) {
      return ['INSURANCE', 'INSURANCE_DECLINE'];
    }

    return [];
  }

  private assertPlayerCanAct(
    table: BlackjackTableRuntime,
    seat: BlackjackSeatRuntime,
    hand: BlackjackSeatHandRuntime,
    user: BlackjackSocketUser,
    seatNo: number,
    action: BlackjackSocketPlayerAction,
  ) {
    if (!table.round || table.phase !== 'PLAYER_TURNS') {
      throw new BlackjackTableError(
        'ROUND_NOT_ACTIVE',
        `Table ${table.tableId} does not have an active player turn.`,
      );
    }

    if (getHands(seat).length === 0) {
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

    if (hand.pendingAction) {
      throw new BlackjackTableError(
        'ACTION_NOT_ALLOWED',
        `Seat ${seatNo} already has an action in progress.`,
      );
    }

    if (!this.getAvailableHandActions(table, seat, hand).includes(action)) {
      throw new BlackjackTableError(
        'ACTION_NOT_ALLOWED',
        `${action} is not available for seat ${seatNo}.`,
      );
    }
  }

  private getAvailableHandActions(
    table: BlackjackTableRuntime,
    seat: BlackjackSeatRuntime,
    hand: BlackjackSeatHandRuntime,
  ): BlackjackSocketPlayerAction[] {
    if (
      table.round &&
      table.phase === 'INSURANCE_DECISION' &&
      table.round.currentTurnSeatNo === seat.seatNo &&
      table.round.currentTurnHandNo === hand.handNo
    ) {
      return this.getInsuranceDecisionActions(table, hand);
    }

    if (
      !table.round ||
      table.phase !== 'PLAYER_TURNS' ||
      table.round.currentTurnSeatNo !== seat.seatNo ||
      table.round.currentTurnHandNo !== hand.handNo ||
      hand.pendingAction ||
      hand.status !== 'PLAYING'
    ) {
      return [];
    }

    return getAvailablePlayerActions(
      {
        cards: hand.cards,
        isAfterSplit: hand.isSplitHand,
        isSplitAces: hand.isSplitAces,
        currentHandCount: getHands(seat).length,
        hitSplitAcesAllowed: table.hitSplitAcesAllowed,
      },
      {
        doubleAllowed: table.doubleAllowed && !hand.isSplitHand,
        doubleAfterSplitAllowed: table.doubleAfterSplitAllowed,
        splitAllowed:
          table.splitAllowed && (!hand.isSplitAces || table.resplitAcesAllowed),
        surrenderAllowed:
          table.surrenderMode !== 'NONE' && hand.isSplitHand !== true,
        maxSplitHands: table.maxSplitHands,
      },
    ).filter(isSocketPlayerAction);
  }

  private getCurrentTurnHand(
    table: BlackjackTableRuntime,
    seat: BlackjackSeatRuntime,
  ) {
    if (!table.round || table.round.currentTurnSeatNo !== seat.seatNo) {
      return null;
    }

    return findHandByNo(seat, table.round.currentTurnHandNo);
  }

  private getProjectedSeatHand(
    table: BlackjackTableRuntime,
    seat: BlackjackSeatRuntime,
  ) {
    return this.getCurrentTurnHand(table, seat) ?? getHands(seat)[0] ?? null;
  }

  private getSortedOccupiedSeats(table: BlackjackTableRuntime) {
    return Array.from(table.seats.values()).sort(
      (left, right) => left.seatNo - right.seatNo,
    );
  }

  private createShuffledShoe(table: BlackjackTableRuntime) {
    if (this.shoeFactory) {
      return [...this.shoeFactory()];
    }

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
      .flatMap((seat): (BlackjackSettlementSeatRequest | null)[] => {
        if (!seat.bet) {
          return [null];
        }

        const bet = seat.bet;

        return getHands(seat).map((seatHand) => {
          const hand = evaluateHand(seatHand.cards);
          const outcome = calculateHandOutcome(
            seatHand.status,
            hand,
            dealerHand,
            seatHand.isSplitHand,
            seatHand.evenMoneyAccepted,
          );

          return {
            roundSeatId: bet.roundSeatId,
            handNo: seatHand.handNo,
            userId: seat.userId,
            seatNo: seat.seatNo,
            cards: seatHand.cards.map((card) => toCardSnapshot(card)),
            finalValue: hand.total,
            isSoft: hand.isSoft,
            isNaturalBlackjack: hand.isBlackjack && !seatHand.isSplitHand,
            busted: hand.isBust,
            outcome: outcome.outcome,
            outcomeReason: outcome.outcomeReason,
            evenMoneyAccepted: seatHand.evenMoneyAccepted,
          };
        });
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

export type BlackjackReserveDoubleDownInput = BlackjackJoinTableInput & {
  seatNo: number;
  commandId: string;
};

export type BlackjackConfirmDoubleDownInput =
  BlackjackReserveDoubleDownInput & {
    roundId: string;
    roundSeatId: string;
    handNo: number;
    amount: bigint;
  };

export type BlackjackCancelDoubleDownInput = {
  tableId: string;
  seatNo: number;
  handNo: number;
  commandId: string;
};

export type BlackjackReserveSplitInput = BlackjackJoinTableInput & {
  seatNo: number;
  commandId: string;
};

export type BlackjackConfirmSplitInput = BlackjackReserveSplitInput & {
  roundId: string;
  roundSeatId: string;
  sourceHandNo: number;
  newHandNo: number;
  amount: bigint;
};

export type BlackjackCancelSplitInput = {
  tableId: string;
  seatNo: number;
  sourceHandNo: number;
  commandId: string;
};

export type BlackjackReserveInsuranceInput = BlackjackJoinTableInput & {
  seatNo: number;
  commandId: string;
};

export type BlackjackConfirmInsuranceInput = BlackjackReserveInsuranceInput & {
  roundId: string;
  roundSeatId: string;
  amount: bigint;
};

export type BlackjackCancelInsuranceInput = {
  tableId: string;
  seatNo: number;
  commandId: string;
};

export type BlackjackInsuranceDecisionInput = BlackjackJoinTableInput & {
  seatNo: number;
  commandId?: string;
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
  handNo: number;
  userId: string;
  seatNo: number;
  cards: BlackjackCardSnapshot[];
  finalValue: number;
  isSoft: boolean;
  isNaturalBlackjack: boolean;
  busted: boolean;
  outcome: BlackjackHandOutcome;
  outcomeReason: BlackjackHandOutcomeReason;
  evenMoneyAccepted?: boolean;
};

export type BlackjackSettlementSeatResult = {
  roundSeatId: string;
  handNo: number;
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

export type BlackjackDoubleDownReservation = {
  kind: 'reserved' | 'already-confirmed';
  tableId: string;
  roundId: string;
  roundSeatId: string;
  seatNo: number;
  handNo: number;
  amount: bigint;
  commandId: string;
};

export type BlackjackSplitReservation = {
  kind: 'reserved' | 'already-confirmed';
  tableId: string;
  roundId: string;
  roundSeatId: string;
  seatNo: number;
  sourceHandNo: number;
  newHandNo: number;
  amount: bigint;
  commandId: string;
};

export type BlackjackInsuranceReservation = {
  kind: 'reserved' | 'already-confirmed';
  tableId: string;
  roundId: string;
  roundSeatId: string;
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
  insuranceAllowed: boolean;
  evenMoneyAllowed: boolean;
  doubleAllowed: boolean;
  splitAllowed: boolean;
  doubleAfterSplitAllowed: boolean;
  maxSplitHands: number;
  resplitAcesAllowed: boolean;
  hitSplitAcesAllowed: boolean;
  surrenderMode: BlackjackSurrenderMode;
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
  hands?: BlackjackSeatHandRuntime[];
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
  handNo: number;
  cards: BlackjackCard[];
  status: BlackjackHandStatus;
  betAmount: bigint;
  isSplitHand: boolean;
  isSplitAces?: boolean;
  sourceHandNo?: number;
  pendingAction?: BlackjackPendingActionRuntime;
  doubleCommandId?: string;
  splitCommandId?: string;
  splitNewHandNo?: number;
  insuranceDecision?: BlackjackInsuranceDecisionStatus;
  insuranceCommandId?: string;
  insuranceBetAmount?: bigint;
  evenMoneyAccepted?: boolean;
  evenMoneyCommandId?: string;
  outcome?: BlackjackHandOutcome;
  outcomeReason?: BlackjackHandOutcomeReason;
  payoutAmount?: bigint;
  netAmount?: bigint;
};

type BlackjackPendingActionRuntime = {
  action: 'DOUBLE' | 'SPLIT' | 'INSURANCE';
  commandId: string;
  newHandNo?: number;
};

type BlackjackInsuranceDecisionStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';

type BlackjackRoundRuntime = {
  roundId: string;
  currentTurnSeatNo: number | null;
  currentTurnHandNo: number | null;
  dealerCards: BlackjackCard[];
};

type BlackjackSurrenderMode = 'NONE' | 'LATE' | 'EARLY';

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

function normalizeMaxSplitHands(maxSplitHands: number) {
  if (
    !Number.isInteger(maxSplitHands) ||
    maxSplitHands < 1 ||
    maxSplitHands > 4
  ) {
    throw new BlackjackTableError(
      'UNKNOWN_ERROR',
      'Blackjack maxSplitHands must be an integer between 1 and 4.',
    );
  }

  return maxSplitHands;
}

function normalizeSurrenderMode(
  surrenderMode: BlackjackSurrenderMode,
): BlackjackSurrenderMode {
  if (
    surrenderMode !== 'NONE' &&
    surrenderMode !== 'LATE' &&
    surrenderMode !== 'EARLY'
  ) {
    throw new BlackjackTableError(
      'UNKNOWN_ERROR',
      `Unsupported blackjack surrenderMode ${String(surrenderMode)}.`,
    );
  }

  return surrenderMode;
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
  if (
    action !== 'HIT' &&
    action !== 'STAND' &&
    action !== 'DOUBLE' &&
    action !== 'SPLIT' &&
    action !== 'SURRENDER' &&
    action !== 'INSURANCE' &&
    action !== 'INSURANCE_DECLINE' &&
    action !== 'EVEN_MONEY'
  ) {
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

function getHands(seat: BlackjackSeatRuntime) {
  return seat.hands ?? [];
}

function findHandByNo(
  seat: BlackjackSeatRuntime,
  handNo: number | null,
): BlackjackSeatHandRuntime | undefined {
  if (handNo === null) {
    return undefined;
  }

  return getHands(seat).find((hand) => hand.handNo === handNo);
}

function nextHandNo(seat: BlackjackSeatRuntime) {
  const handNo = Math.max(0, ...getHands(seat).map((hand) => hand.handNo)) + 1;

  if (handNo > 4) {
    throw new BlackjackTableError(
      'ACTION_NOT_ALLOWED',
      'A blackjack seat cannot have more than four hands.',
    );
  }

  return handNo;
}

function isCurrentTurnHand(
  table: BlackjackTableRuntime,
  seat: BlackjackSeatRuntime,
  hand: BlackjackSeatHandRuntime,
) {
  return (
    table.round?.currentTurnSeatNo === seat.seatNo &&
    table.round.currentTurnHandNo === hand.handNo
  );
}

function applyPostSplitInitialStatus(
  hand: BlackjackSeatHandRuntime,
  table: BlackjackTableRuntime,
) {
  const evaluatedHand = evaluateHand(hand.cards);

  if (evaluatedHand.isBust) {
    hand.status = 'BUSTED';
    return;
  }

  if (
    evaluatedHand.total === 21 ||
    (hand.isSplitAces && !table.hitSplitAcesAllowed)
  ) {
    hand.status = 'STOOD';
  }
}

function isAcePair(cards: readonly BlackjackCard[]) {
  return cards.length === 2 && cards[0]?.rank === 'A' && cards[1]?.rank === 'A';
}

function isDealerUpcardAce(table: BlackjackTableRuntime) {
  return table.round?.dealerCards[0]?.rank === 'A';
}

function isDealerPeekUpcard(table: BlackjackTableRuntime) {
  const rank = table.round?.dealerCards[0]?.rank;

  return (
    rank === 'A' ||
    rank === '10' ||
    rank === 'J' ||
    rank === 'Q' ||
    rank === 'K'
  );
}

function toCardSnapshot(
  card: BlackjackCard,
  hidden = false,
): BlackjackCardSnapshot {
  return hidden ? { ...card, hidden: true } : card;
}

function isSocketPlayerAction(
  action: BlackjackEnginePlayerAction,
): action is Extract<BlackjackSocketPlayerAction, BlackjackEnginePlayerAction> {
  return (
    action === 'HIT' ||
    action === 'STAND' ||
    action === 'DOUBLE' ||
    action === 'SPLIT' ||
    action === 'SURRENDER'
  );
}

function isSettlementSeatRequest(
  seat: BlackjackSettlementSeatRequest | null,
): seat is BlackjackSettlementSeatRequest {
  return seat !== null;
}

function calculateHandOutcome(
  status: BlackjackHandStatus,
  player: ReturnType<typeof evaluateHand>,
  dealer: ReturnType<typeof evaluateHand>,
  isSplitHand = false,
  evenMoneyAccepted = false,
): {
  outcome: BlackjackHandOutcome;
  outcomeReason: BlackjackHandOutcomeReason;
} {
  if (status === 'SURRENDERED') {
    return { outcome: 'LOSE', outcomeReason: 'SURRENDER' };
  }

  if (player.isBust) {
    return { outcome: 'LOSE', outcomeReason: 'PLAYER_BUST' };
  }

  const isNaturalBlackjack = player.isBlackjack && !isSplitHand;

  if (evenMoneyAccepted && isNaturalBlackjack) {
    return { outcome: 'WIN', outcomeReason: 'STANDARD' };
  }

  if (dealer.isBlackjack && !isNaturalBlackjack) {
    return { outcome: 'LOSE', outcomeReason: 'DEALER_BLACKJACK' };
  }

  if (isNaturalBlackjack && dealer.isBlackjack) {
    return { outcome: 'PUSH', outcomeReason: 'DEALER_BLACKJACK' };
  }

  if (isNaturalBlackjack) {
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
