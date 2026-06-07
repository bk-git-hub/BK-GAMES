jest.mock('./blackjack-engine.port', () => {
  type MockCard = {
    rank: string;
    suit: string;
  };

  const ranks = [
    'A',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '10',
    'J',
    'Q',
    'K',
  ];
  const suits = ['clubs', 'diamonds', 'hearts', 'spades'];
  const rankValue = (rank: string) => {
    if (rank === 'A') {
      return 11;
    }

    if (rank === 'J' || rank === 'Q' || rank === 'K') {
      return 10;
    }

    return Number(rank);
  };
  const evaluateHand = (cards: readonly MockCard[]) => {
    let total = 0;
    let hardTotal = 0;
    let aceCount = 0;

    for (const card of cards) {
      if (card.rank === 'A') {
        aceCount += 1;
        total += 11;
        hardTotal += 1;
      } else {
        const value = rankValue(card.rank);

        total += value;
        hardTotal += value;
      }
    }

    let softAceCount = aceCount;

    while (total > 21 && softAceCount > 0) {
      total -= 10;
      softAceCount -= 1;
    }

    return {
      cards,
      cardCount: cards.length,
      total,
      hardTotal,
      softAceCount,
      isSoft: softAceCount > 0,
      isBlackjack: cards.length === 2 && total === 21,
      isBust: total > 21,
    };
  };

  return {
    createDeck: (deckCount = 1) => {
      const deck: MockCard[] = [];

      for (let deckIndex = 0; deckIndex < deckCount; deckIndex += 1) {
        for (const suit of suits) {
          for (const rank of ranks) {
            deck.push({ rank, suit });
          }
        }
      }

      return deck;
    },
    shuffleDeck: (
      cards: readonly MockCard[],
      random: () => number = Math.random,
    ) => {
      const shuffled = [...cards];

      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        const current = shuffled[index];
        const swap = shuffled[swapIndex];

        if (current && swap) {
          shuffled[index] = swap;
          shuffled[swapIndex] = current;
        }
      }

      return shuffled;
    },
    evaluateHand,
    shouldDealerHit: (
      cards: readonly MockCard[],
      policy: { dealerHitsSoft17: boolean },
    ) => {
      const hand = evaluateHand(cards);

      return (
        hand.total < 17 ||
        (hand.total === 17 && hand.isSoft && policy.dealerHitsSoft17)
      );
    },
    getAvailablePlayerActions: (
      context: {
        cards: readonly MockCard[];
        isAfterSplit?: boolean;
        isSplitAces?: boolean;
        currentHandCount?: number;
        hitSplitAcesAllowed?: boolean;
      },
      rules: {
        doubleAllowed?: boolean;
        doubleAfterSplitAllowed?: boolean;
        splitAllowed?: boolean;
        surrenderAllowed?: boolean;
        maxSplitHands?: number;
      } = {},
    ) => {
      const hand = evaluateHand(context.cards);

      if (hand.isBust || hand.isBlackjack) {
        return [];
      }

      if (context.isSplitAces && !context.hitSplitAcesAllowed) {
        return ['STAND'];
      }

      const actions = ['HIT', 'STAND'];

      if (
        context.cards.length === 2 &&
        rules.doubleAllowed &&
        (!context.isAfterSplit || rules.doubleAfterSplitAllowed)
      ) {
        actions.push('DOUBLE');
      }

      if (
        context.cards.length === 2 &&
        rules.splitAllowed &&
        context.cards[0]?.rank === context.cards[1]?.rank &&
        (context.currentHandCount ?? 1) < (rules.maxSplitHands ?? 4)
      ) {
        actions.push('SPLIT');
      }

      if (context.cards.length === 2 && rules.surrenderAllowed) {
        actions.push('SURRENDER');
      }

      return actions;
    },
  };
});

import {
  BlackjackTableError,
  BlackjackTableService,
  type BlackjackTableConfig,
} from './blackjack-table.service';
import type { BlackjackCard } from './blackjack-engine.port';

const alice = {
  userId: 'user-alice',
  nickname: 'Alice',
  role: 'USER' as const,
};

const bob = {
  userId: 'user-bob',
  nickname: 'Bob',
  role: 'USER' as const,
};

function createDeterministicService() {
  return new BlackjackTableService({ deckCount: 1, randomSource: () => 0 });
}

function createRiggedService(
  shoe: BlackjackCard[],
  options: ConstructorParameters<typeof BlackjackTableService>[0] = {},
) {
  return new BlackjackTableService({
    deckCount: 1,
    ...options,
    shoeFactory: () => shoe,
  });
}

function card(
  rank: BlackjackCard['rank'],
  suit: BlackjackCard['suit'] = 'clubs',
): BlackjackCard {
  return { rank, suit };
}

function createTimedService(start = new Date('2026-06-07T00:00:00.000Z')) {
  let now = start;
  const service = new BlackjackTableService({
    deckCount: 1,
    randomSource: () => 0,
    nowSource: () => now,
    bettingWindowMs: 20_000,
  });

  return {
    service,
    setNow: (value: Date) => {
      now = value;
    },
  };
}

function configuredTable(
  overrides: Partial<BlackjackTableConfig> = {},
): BlackjackTableConfig {
  return {
    status: 'OPEN',
    maxSeats: 7,
    maxSeatsPerUser: 7,
    minInitialBet: 100n,
    maxInitialBet: 6_000n,
    maxTotalBetPerSeat: 24_000n,
    maxTotalBetPerUser: 42_000n,
    deckCount: 1,
    dealerHitsSoft17: false,
    insuranceAllowed: false,
    evenMoneyAllowed: false,
    doubleAllowed: true,
    splitAllowed: true,
    doubleAfterSplitAllowed: false,
    maxSplitHands: 4,
    resplitAcesAllowed: false,
    hitSplitAcesAllowed: false,
    surrenderMode: 'LATE',
    bettingWindowMs: 20_000,
    ...overrides,
  };
}

function expectWaitingSeat(
  seatNo: number,
  user: typeof alice,
  connected = true,
) {
  return {
    seatNo,
    userId: user.userId,
    nickname: user.nickname,
    status: 'OCCUPIED',
    connected,
    betAmount: null,
    handStatus: 'WAITING_BET',
    cards: [],
    score: null,
    isSoft: false,
    isCurrentTurn: false,
    availableActions: [],
    activeHandNo: null,
    hands: [],
    outcome: null,
    outcomeReason: null,
    payoutAmount: null,
    netAmount: null,
  };
}

function confirmInitialBet(input: {
  service: BlackjackTableService;
  tableId: string;
  socketId: string;
  user: typeof alice;
  seatNo: number;
  amount?: bigint;
  commandId: string;
  roundId: string;
  roundSeatId: string;
}) {
  const amount = input.amount ?? 500n;
  const reservation = input.service.reserveBet({
    tableId: input.tableId,
    socketId: input.socketId,
    user: input.user,
    seatNo: input.seatNo,
    amount,
    commandId: input.commandId,
  });

  return input.service.confirmBet({
    tableId: reservation.tableId,
    socketId: input.socketId,
    user: input.user,
    seatNo: reservation.seatNo,
    amount: reservation.amount,
    commandId: reservation.commandId,
    roundId: input.roundId,
    roundSeatId: input.roundSeatId,
  });
}

function expireBettingWindowOrFail(
  service: BlackjackTableService,
  tableId = 'main',
) {
  const update = service.expireBettingWindow({
    tableId,
    now: new Date('2999-01-01T00:00:00.000Z'),
  });

  if (!update) {
    throw new Error('Expected betting window to expire and start the round.');
  }

  return update;
}

function dealInitialRoundOrFail(
  service: BlackjackTableService,
  tableId = 'main',
) {
  let update: ReturnType<BlackjackTableService['advanceDealing']> | undefined;

  for (let step = 0; step < 20; step += 1) {
    update = service.advanceDealing({ tableId });

    if (!update) {
      break;
    }

    if (update.state.phase !== 'DEALING') {
      return update;
    }
  }

  throw new Error('Expected initial deal to advance to the next round phase.');
}

function startActiveRoundOrFail(
  service: BlackjackTableService,
  tableId = 'main',
) {
  expireBettingWindowOrFail(service, tableId);
  return dealInitialRoundOrFail(service, tableId);
}

function advanceDealerTurnOrFail(
  service: BlackjackTableService,
  tableId = 'main',
) {
  const update = service.advanceDealerTurn({ tableId });

  if (!update) {
    throw new Error('Expected dealer turn to advance.');
  }

  return update;
}

function advanceDealerTurnToSettlementOrFail(
  service: BlackjackTableService,
  tableId = 'main',
) {
  let update: ReturnType<BlackjackTableService['advanceDealerTurn']>;

  for (let step = 0; step < 20; step += 1) {
    update = advanceDealerTurnOrFail(service, tableId);

    if (update.state.phase === 'SETTLING') {
      return update;
    }
  }

  throw new Error('Expected dealer turn to advance to settlement.');
}

function confirmSplitAction(input: {
  service: BlackjackTableService;
  tableId: string;
  socketId: string;
  user: typeof alice;
  seatNo: number;
  commandId: string;
}) {
  const reservation = input.service.reserveSplit({
    tableId: input.tableId,
    socketId: input.socketId,
    user: input.user,
    seatNo: input.seatNo,
    commandId: input.commandId,
  });

  return input.service.confirmSplit({
    tableId: input.tableId,
    socketId: input.socketId,
    user: input.user,
    seatNo: reservation.seatNo,
    commandId: reservation.commandId,
    roundId: reservation.roundId,
    roundSeatId: reservation.roundSeatId,
    sourceHandNo: reservation.sourceHandNo,
    newHandNo: reservation.newHandNo,
    amount: reservation.amount,
  });
}

describe('BlackjackTableService', () => {
  it('broadcasts shared state as users join and take seats', () => {
    const service = new BlackjackTableService();

    service.joinTable({
      tableId: 'table-1',
      socketId: 'socket-alice',
      user: alice,
    });
    service.joinTable({
      tableId: 'table-1',
      socketId: 'socket-bob',
      user: bob,
    });

    const aliceSeat = service.takeSeat({
      tableId: 'table-1',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    const bobSeat = service.takeSeat({
      tableId: 'table-1',
      socketId: 'socket-bob',
      user: bob,
      seatNo: 2,
    });

    expect(aliceSeat.event.type).toBe('SEAT_TAKEN');
    expect(bobSeat.state.seats).toEqual([
      expectWaitingSeat(1, alice),
      expectWaitingSeat(2, bob),
    ]);
  });

  it('allows one user to occupy multiple seats', () => {
    const service = new BlackjackTableService();

    service.takeSeat({
      tableId: 'table-1',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    const secondSeat = service.takeSeat({
      tableId: 'table-1',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 2,
    });

    expect(secondSeat.state.seats).toHaveLength(2);
    expect(secondSeat.state.seats.map((seat) => seat.userId)).toEqual([
      'user-alice',
      'user-alice',
    ]);
  });

  it('rejects taking a seat occupied by another user', () => {
    const service = new BlackjackTableService();

    service.takeSeat({
      tableId: 'table-1',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });

    expect(() =>
      service.takeSeat({
        tableId: 'table-1',
        socketId: 'socket-bob',
        user: bob,
        seatNo: 1,
      }),
    ).toThrow(BlackjackTableError);
  });

  it('marks seats disconnected without removing them', () => {
    const service = new BlackjackTableService();

    service.takeSeat({
      tableId: 'table-1',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });

    const [disconnectUpdate] = service.disconnectSocket('socket-alice');

    expect(disconnectUpdate?.event.type).toBe('PLAYER_DISCONNECTED');
    expect(disconnectUpdate?.state.seats).toEqual([
      expectWaitingSeat(1, alice, false),
    ]);
  });

  it('confirms a reserved bet and opens the betting window', () => {
    const service = createDeterministicService();

    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    const betPlaced = confirmInitialBet({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'command-1',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
    });

    expect(betPlaced.event.type).toBe('BET_PLACED');
    expect(betPlaced.state.phase).toBe('WAITING_BETS');
    expect(betPlaced.state.round).toBeNull();
    expect(betPlaced.state.timers.phaseEndsAt).not.toBeNull();
    expect(betPlaced.state.seats).toEqual([
      expect.objectContaining({
        seatNo: 1,
        betAmount: '500',
        handStatus: 'BET_PLACED',
        cards: [],
        score: null,
        isCurrentTurn: false,
        availableActions: [],
      }),
    ]);
  });

  it('starts a one-seat round and deals initial cards one by one', () => {
    const service = createDeterministicService();

    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    confirmInitialBet({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'command-1',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
    });

    const roundStarted = expireBettingWindowOrFail(service);

    expect(roundStarted.event.type).toBe('ROUND_STARTED');
    expect(roundStarted.state.phase).toBe('DEALING');
    expect(roundStarted.state.round).toEqual({
      roundId: 'round-1',
      currentTurnSeatNo: null,
      currentTurnHandNo: null,
    });
    expect(roundStarted.state.dealer).toEqual({
      cards: [],
      visibleScore: null,
      score: null,
    });
    expect(roundStarted.state.seats[0]).toEqual(
      expect.objectContaining({
        cards: [],
        score: null,
        isCurrentTurn: false,
        availableActions: [],
      }),
    );

    const firstPlayerCard = service.advanceDealing({ tableId: 'main' });

    expect(firstPlayerCard?.event).toEqual(
      expect.objectContaining({
        type: 'CARD_DEALT',
        card: { rank: '2', suit: 'clubs' },
        cardTarget: {
          type: 'PLAYER',
          seatNo: 1,
          handNo: 1,
          cardIndex: 0,
        },
      }),
    );

    const dealerUpcard = service.advanceDealing({ tableId: 'main' });

    expect(dealerUpcard?.event).toEqual(
      expect.objectContaining({
        type: 'CARD_DEALT',
        card: { rank: '3', suit: 'clubs' },
        cardTarget: {
          type: 'DEALER',
          cardIndex: 0,
          hidden: false,
        },
      }),
    );

    const secondPlayerCard = service.advanceDealing({ tableId: 'main' });

    expect(secondPlayerCard?.event).toEqual(
      expect.objectContaining({
        type: 'CARD_DEALT',
        card: { rank: '4', suit: 'clubs' },
        cardTarget: {
          type: 'PLAYER',
          seatNo: 1,
          handNo: 1,
          cardIndex: 1,
        },
      }),
    );

    const holeCard = service.advanceDealing({ tableId: 'main' });

    expect(holeCard?.event).toEqual(
      expect.objectContaining({
        type: 'DEALER_HOLE_CARD_DEALT',
        card: { hidden: true },
        cardTarget: {
          type: 'DEALER',
          cardIndex: 1,
          hidden: true,
        },
      }),
    );
    expect(holeCard?.state.phase).toBe('PLAYER_TURNS');
    expect(holeCard?.state.round).toEqual({
      roundId: 'round-1',
      currentTurnSeatNo: 1,
      currentTurnHandNo: 1,
    });
    expect(holeCard?.state.dealer).toEqual({
      cards: [{ rank: '3', suit: 'clubs' }, { hidden: true }],
      visibleScore: 3,
      score: null,
    });
    expect(holeCard?.state.seats).toEqual([
      expect.objectContaining({
        seatNo: 1,
        betAmount: '500',
        handStatus: 'PLAYING',
        cards: [
          { rank: '2', suit: 'clubs' },
          { rank: '4', suit: 'clubs' },
        ],
        score: 6,
        isCurrentTurn: true,
        availableActions: ['HIT', 'STAND', 'DOUBLE', 'SURRENDER'],
      }),
    ]);
  });

  it('uses configured table rules for limits, betting timer, and actions', () => {
    const service = new BlackjackTableService({
      deckCount: 1,
      nowSource: () => new Date('2026-06-07T00:00:00.000Z'),
      shoeFactory: () => [
        card('8', 'clubs'),
        card('5', 'clubs'),
        card('7', 'diamonds'),
        card('9', 'clubs'),
      ],
    });

    service.configureTable({
      tableId: 'main',
      config: configuredTable({
        maxSeats: 3,
        maxSeatsPerUser: 1,
        minInitialBet: 250n,
        maxInitialBet: 250n,
        maxTotalBetPerSeat: 250n,
        maxTotalBetPerUser: 250n,
        doubleAllowed: false,
        splitAllowed: false,
        surrenderMode: 'NONE',
        bettingWindowMs: 45_000,
      }),
    });

    expect(() =>
      service.takeSeat({
        tableId: 'main',
        socketId: 'socket-alice',
        user: alice,
        seatNo: 4,
      }),
    ).toThrow(BlackjackTableError);

    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    expect(() =>
      service.reserveBet({
        tableId: 'main',
        socketId: 'socket-alice',
        user: alice,
        seatNo: 1,
        amount: 100n,
        commandId: 'too-low-command',
      }),
    ).toThrow(BlackjackTableError);

    const bet = confirmInitialBet({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      amount: 250n,
      commandId: 'command-1',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
    });

    expect(bet.state.timers.phaseEndsAt).toBe('2026-06-07T00:00:45.000Z');

    const roundStarted = startActiveRoundOrFail(service);

    expect(roundStarted.state.phase).toBe('PLAYER_TURNS');
    expect(roundStarted.state.bettingLimits).toEqual({
      minInitialBet: '250',
      maxInitialBet: '250',
      maxTotalBetPerSeat: '250',
      maxTotalBetPerUser: '250',
    });
    expect(roundStarted.state.seats[0]).toEqual(
      expect.objectContaining({
        availableActions: ['HIT', 'STAND'],
      }),
    );
  });

  it('peeks under a ten-value upcard and settles dealer blackjack immediately', () => {
    const service = createRiggedService([
      card('8', 'clubs'),
      card('K', 'clubs'),
      card('7', 'diamonds'),
      card('A', 'clubs'),
    ]);

    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    confirmInitialBet({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'command-1',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
    });

    const roundStarted = startActiveRoundOrFail(service);

    expect(roundStarted.event.type).toBe('DEALER_HOLE_CARD_DEALT');
    expect(roundStarted.state.phase).toBe('DEALER_TURN');
    expect(roundStarted.state.round).toEqual({
      roundId: 'round-1',
      currentTurnSeatNo: null,
      currentTurnHandNo: null,
    });
    expect(roundStarted.state.dealer).toEqual({
      cards: [{ rank: 'K', suit: 'clubs' }, { hidden: true }],
      visibleScore: 10,
      score: null,
    });
    expect(roundStarted.state.seats[0]).toEqual(
      expect.objectContaining({
        seatNo: 1,
        cards: [
          { rank: '8', suit: 'clubs' },
          { rank: '7', suit: 'diamonds' },
        ],
        isCurrentTurn: false,
        availableActions: [],
      }),
    );
    expect(roundStarted.settlement).toBeUndefined();

    const reveal = advanceDealerTurnOrFail(service);

    expect(reveal.event).toEqual(
      expect.objectContaining({
        type: 'DEALER_HOLE_CARD_REVEALED',
        card: { rank: 'A', suit: 'clubs' },
      }),
    );

    const result = advanceDealerTurnToSettlementOrFail(service);

    expect(result.event.type).toBe('DEALER_PLAYED');
    expect(result.state.phase).toBe('SETTLING');
    expect(result.settlement?.dealer.hasBlackjack).toBe(true);
    expect(result.settlement?.seats).toEqual([
      expect.objectContaining({
        roundSeatId: 'round-seat-1',
        handNo: 1,
        outcome: 'LOSE',
        outcomeReason: 'DEALER_BLACKJACK',
      }),
    ]);
  });

  it('continues to player turns when the dealer ten-value peek is not blackjack', () => {
    const service = createRiggedService([
      card('8', 'clubs'),
      card('K', 'clubs'),
      card('7', 'diamonds'),
      card('6', 'clubs'),
    ]);

    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    confirmInitialBet({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'command-1',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
    });

    const roundStarted = startActiveRoundOrFail(service);

    expect(roundStarted.state.phase).toBe('PLAYER_TURNS');
    expect(roundStarted.state.round).toEqual({
      roundId: 'round-1',
      currentTurnSeatNo: 1,
      currentTurnHandNo: 1,
    });
    expect(roundStarted.state.dealer).toEqual({
      cards: [{ rank: 'K', suit: 'clubs' }, { hidden: true }],
      visibleScore: 10,
      score: null,
    });
    expect(roundStarted.state.seats[0]).toEqual(
      expect.objectContaining({
        isCurrentTurn: true,
        availableActions: ['HIT', 'STAND', 'DOUBLE', 'SURRENDER'],
      }),
    );
    expect(roundStarted.settlement).toBeUndefined();
  });

  it('peeks an ace-upcard dealer blackjack immediately when insurance is not offered', () => {
    const service = createRiggedService([
      card('8', 'clubs'),
      card('A', 'clubs'),
      card('7', 'diamonds'),
      card('K', 'clubs'),
    ]);

    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    confirmInitialBet({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'command-1',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
    });

    const roundStarted = startActiveRoundOrFail(service);

    expect(roundStarted.state.phase).toBe('DEALER_TURN');
    expect(roundStarted.state.dealer).toEqual({
      cards: [{ rank: 'A', suit: 'clubs' }, { hidden: true }],
      visibleScore: 11,
      score: null,
    });
    const reveal = advanceDealerTurnOrFail(service);

    expect(reveal.event).toEqual(
      expect.objectContaining({
        type: 'DEALER_HOLE_CARD_REVEALED',
        card: { rank: 'K', suit: 'clubs' },
      }),
    );

    const result = advanceDealerTurnToSettlementOrFail(service);

    expect(result.settlement?.dealer.hasBlackjack).toBe(true);
    expect(result.settlement?.seats).toEqual([
      expect.objectContaining({
        outcome: 'LOSE',
        outcomeReason: 'DEALER_BLACKJACK',
      }),
    ]);
  });

  it('waits for the betting window before dealing all confirmed seats', () => {
    const service = createDeterministicService();

    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-bob',
      user: bob,
      seatNo: 2,
    });

    const firstBet = confirmInitialBet({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'command-1',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
    });
    const secondBet = confirmInitialBet({
      service,
      tableId: 'main',
      socketId: 'socket-bob',
      user: bob,
      seatNo: 2,
      commandId: 'command-2',
      roundId: 'round-2',
      roundSeatId: 'round-seat-2',
    });

    expect(firstBet.event.type).toBe('BET_PLACED');
    expect(firstBet.state.round).toBeNull();
    expect(firstBet.state.timers.phaseEndsAt).not.toBeNull();
    expect(secondBet.event.type).toBe('BET_PLACED');
    expect(secondBet.state.round).toBeNull();

    const roundStarted = startActiveRoundOrFail(service);

    expect(roundStarted.event.type).toBe('DEALER_HOLE_CARD_DEALT');
    expect(roundStarted.state.round).toEqual({
      roundId: 'round-1',
      currentTurnSeatNo: 1,
      currentTurnHandNo: 1,
    });
    expect(roundStarted.state.dealer.cards).toEqual([
      { rank: '4', suit: 'clubs' },
      { hidden: true },
    ]);
    expect(roundStarted.state.seats).toEqual([
      expect.objectContaining({
        seatNo: 1,
        betAmount: '500',
        cards: [
          { rank: '2', suit: 'clubs' },
          { rank: '5', suit: 'clubs' },
        ],
        score: 7,
        isCurrentTurn: true,
      }),
      expect.objectContaining({
        seatNo: 2,
        betAmount: '500',
        cards: [
          { rank: '3', suit: 'clubs' },
          { rank: '6', suit: 'clubs' },
        ],
        score: 9,
        isCurrentTurn: false,
      }),
    ]);
  });

  it('preserves confirmed bets when the same user retakes a seat during betting', () => {
    const service = createDeterministicService();

    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    confirmInitialBet({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'command-1',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
    });

    const seatRetaken = service.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice-2',
      user: { ...alice, nickname: 'Alice Updated' },
      seatNo: 1,
    });

    expect(seatRetaken.state.seats).toEqual([
      expect.objectContaining({
        seatNo: 1,
        nickname: 'Alice Updated',
        betAmount: '500',
        handStatus: 'BET_PLACED',
      }),
    ]);
  });

  it('starts a round with confirmed bets when the betting window expires', () => {
    const { service, setNow } = createTimedService();

    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-bob',
      user: bob,
      seatNo: 2,
    });

    const firstBet = confirmInitialBet({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'command-1',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
    });

    expect(firstBet.event.type).toBe('BET_PLACED');
    expect(firstBet.state.phase).toBe('WAITING_BETS');
    expect(firstBet.state.timers.phaseEndsAt).toBe('2026-06-07T00:00:20.000Z');

    setNow(new Date('2026-06-07T00:00:19.999Z'));
    expect(service.expireBettingWindow({ tableId: 'main' })).toBeNull();

    setNow(new Date('2026-06-07T00:00:20.000Z'));
    const expired = service.expireBettingWindow({ tableId: 'main' });

    expect(expired?.event.type).toBe('ROUND_STARTED');
    expect(expired?.state.phase).toBe('DEALING');
    expect(expired?.state.timers.phaseEndsAt).toBeNull();
    expect(expired?.state.round).toEqual({
      roundId: 'round-1',
      currentTurnSeatNo: null,
      currentTurnHandNo: null,
    });

    const dealt = dealInitialRoundOrFail(service);

    expect(dealt.state.phase).toBe('PLAYER_TURNS');
    expect(dealt.state.round).toEqual({
      roundId: 'round-1',
      currentTurnSeatNo: 1,
      currentTurnHandNo: 1,
    });
    expect(dealt.state.dealer.cards).toEqual([
      { rank: '3', suit: 'clubs' },
      { hidden: true },
    ]);
    expect(dealt.state.seats).toEqual([
      expect.objectContaining({
        seatNo: 1,
        status: 'OCCUPIED',
        betAmount: '500',
        handStatus: 'PLAYING',
        cards: [
          { rank: '2', suit: 'clubs' },
          { rank: '4', suit: 'clubs' },
        ],
        isCurrentTurn: true,
      }),
      expect.objectContaining({
        seatNo: 2,
        status: 'SITTING_OUT',
        betAmount: null,
        handStatus: 'WAITING_BET',
        cards: [],
        isCurrentTurn: false,
      }),
    ]);
  });

  it('rejects new bet reservations after the betting window expires', () => {
    const { service, setNow } = createTimedService();

    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-bob',
      user: bob,
      seatNo: 2,
    });
    confirmInitialBet({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'command-1',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
    });

    setNow(new Date('2026-06-07T00:00:20.000Z'));

    expect(() =>
      service.reserveBet({
        tableId: 'main',
        socketId: 'socket-bob',
        user: bob,
        seatNo: 2,
        amount: 500n,
        commandId: 'command-2',
      }),
    ).toThrow(BlackjackTableError);
  });

  it('applies player stand and runs the dealer when no player turns remain', () => {
    const service = createDeterministicService();

    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    confirmInitialBet({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'command-1',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
    });
    startActiveRoundOrFail(service);

    const result = service.playerAction({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      action: 'STAND',
    });

    expect(result.event.type).toBe('PLAYER_ACTED');
    expect(result.state.phase).toBe('DEALER_TURN');
    expect(result.state.round).toEqual({
      roundId: 'round-1',
      currentTurnSeatNo: null,
      currentTurnHandNo: null,
    });
    expect(result.state.seats[0]).toEqual(
      expect.objectContaining({
        handStatus: 'STOOD',
        isCurrentTurn: false,
        availableActions: [],
      }),
    );
    expect(result.state.dealer).toEqual({
      cards: [{ rank: '3', suit: 'clubs' }, { hidden: true }],
      visibleScore: 3,
      score: null,
    });

    const dealerResult = advanceDealerTurnToSettlementOrFail(service);

    expect(dealerResult.event.type).toBe('DEALER_PLAYED');
    expect(dealerResult.state.phase).toBe('SETTLING');
    expect(dealerResult.state.dealer).toEqual({
      cards: [
        { rank: '3', suit: 'clubs' },
        { rank: '5', suit: 'clubs' },
        { rank: '6', suit: 'clubs' },
        { rank: '7', suit: 'clubs' },
      ],
      visibleScore: 21,
      score: 21,
    });
    expect(dealerResult.settlement).toEqual({
      tableId: 'main',
      roundId: 'round-1',
      dealer: {
        cards: [
          { rank: '3', suit: 'clubs' },
          { rank: '5', suit: 'clubs' },
          { rank: '6', suit: 'clubs' },
          { rank: '7', suit: 'clubs' },
        ],
        finalValue: 21,
        hasBlackjack: false,
        busted: false,
      },
      seats: [
        {
          roundSeatId: 'round-seat-1',
          handNo: 1,
          userId: 'user-alice',
          seatNo: 1,
          cards: [
            { rank: '2', suit: 'clubs' },
            { rank: '4', suit: 'clubs' },
          ],
          finalValue: 6,
          isSoft: false,
          isNaturalBlackjack: false,
          busted: false,
          outcome: 'LOSE',
          outcomeReason: 'STANDARD',
        },
      ],
    });
  });

  it('applies player surrender and settles with a surrender outcome', () => {
    const service = createDeterministicService();

    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    confirmInitialBet({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'command-1',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
    });
    startActiveRoundOrFail(service);

    const result = service.playerAction({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      action: 'SURRENDER',
    });

    expect(result.event.type).toBe('PLAYER_ACTED');
    expect(result.state.phase).toBe('DEALER_TURN');
    expect(result.state.seats[0]).toEqual(
      expect.objectContaining({
        handStatus: 'SURRENDERED',
        isCurrentTurn: false,
        availableActions: [],
      }),
    );

    const dealerResult = advanceDealerTurnToSettlementOrFail(service);

    expect(dealerResult.settlement?.seats).toEqual([
      {
        roundSeatId: 'round-seat-1',
        handNo: 1,
        userId: 'user-alice',
        seatNo: 1,
        cards: [
          { rank: '2', suit: 'clubs' },
          { rank: '4', suit: 'clubs' },
        ],
        finalValue: 6,
        isSoft: false,
        isNaturalBlackjack: false,
        busted: false,
        outcome: 'LOSE',
        outcomeReason: 'SURRENDER',
      },
    ]);
  });

  it('opens insurance decisions when the dealer shows an ace', () => {
    const service = createRiggedService(
      [
        card('8', 'clubs'),
        card('A', 'clubs'),
        card('7', 'diamonds'),
        card('K', 'clubs'),
      ],
      { insuranceAllowed: true },
    );

    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    confirmInitialBet({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'command-1',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
    });

    const started = startActiveRoundOrFail(service);

    expect(started.state.phase).toBe('INSURANCE_DECISION');
    expect(started.state.round).toEqual({
      roundId: 'round-1',
      currentTurnSeatNo: 1,
      currentTurnHandNo: 1,
    });
    expect(started.state.dealer).toEqual({
      cards: [{ rank: 'A', suit: 'clubs' }, { hidden: true }],
      visibleScore: 11,
      score: null,
    });
    expect(started.state.seats[0]).toEqual(
      expect.objectContaining({
        availableActions: ['INSURANCE', 'INSURANCE_DECLINE'],
      }),
    );

    const reservation = service.reserveInsurance({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'insurance-command-1',
    });
    const insured = service.confirmInsurance({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: reservation.commandId,
      roundId: reservation.roundId,
      roundSeatId: reservation.roundSeatId,
      amount: reservation.amount,
    });

    expect(reservation.amount).toBe(250n);
    expect(insured.event.type).toBe('PLAYER_ACTED');
    expect(insured.state.phase).toBe('DEALER_TURN');

    const dealerResult = advanceDealerTurnToSettlementOrFail(service);

    expect(dealerResult.settlement?.dealer.hasBlackjack).toBe(true);
    expect(dealerResult.settlement?.seats).toEqual([
      expect.objectContaining({
        roundSeatId: 'round-seat-1',
        handNo: 1,
        outcome: 'LOSE',
        outcomeReason: 'DEALER_BLACKJACK',
      }),
    ]);
  });

  it('settles accepted even money as a standard 1:1 blackjack win', () => {
    const service = createRiggedService(
      [
        card('A', 'hearts'),
        card('A', 'clubs'),
        card('K', 'hearts'),
        card('K', 'clubs'),
      ],
      { evenMoneyAllowed: true },
    );

    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    confirmInitialBet({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'command-1',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
    });

    const started = startActiveRoundOrFail(service);

    expect(started.state.phase).toBe('INSURANCE_DECISION');
    expect(started.state.seats[0]?.availableActions).toEqual([
      'EVEN_MONEY',
      'INSURANCE_DECLINE',
    ]);

    const evenMoney = service.acceptEvenMoney({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'even-money-command-1',
    });

    expect(evenMoney.event.type).toBe('PLAYER_ACTED');
    expect(evenMoney.state.phase).toBe('DEALER_TURN');

    const dealerResult = advanceDealerTurnToSettlementOrFail(service);

    expect(dealerResult.settlement?.seats).toEqual([
      expect.objectContaining({
        roundSeatId: 'round-seat-1',
        handNo: 1,
        outcome: 'WIN',
        outcomeReason: 'STANDARD',
        evenMoneyAccepted: true,
      }),
    ]);
  });

  it('confirms double down by adding one card and ending the hand', () => {
    const service = createDeterministicService();

    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    confirmInitialBet({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'command-1',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
    });
    startActiveRoundOrFail(service);

    const reservation = service.reserveDoubleDown({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'double-command-1',
    });
    const result = service.confirmDoubleDown({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: reservation.commandId,
      roundId: reservation.roundId,
      roundSeatId: reservation.roundSeatId,
      handNo: reservation.handNo,
      amount: reservation.amount,
    });

    expect(reservation).toEqual({
      kind: 'reserved',
      tableId: 'main',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
      seatNo: 1,
      handNo: 1,
      amount: 500n,
      commandId: 'double-command-1',
    });
    expect(result.event.type).toBe('PLAYER_ACTED');
    expect(result.state.phase).toBe('DEALER_TURN');
    expect(result.state.seats[0]).toEqual(
      expect.objectContaining({
        betAmount: '1000',
        handStatus: 'DOUBLED',
        cards: [
          { rank: '2', suit: 'clubs' },
          { rank: '4', suit: 'clubs' },
          { rank: '6', suit: 'clubs' },
        ],
        score: 12,
        isCurrentTurn: false,
        availableActions: [],
      }),
    );
    const dealerResult = advanceDealerTurnToSettlementOrFail(service);

    expect(dealerResult.settlement?.seats).toEqual([
      expect.objectContaining({
        roundSeatId: 'round-seat-1',
        handNo: 1,
        userId: 'user-alice',
        seatNo: 1,
        finalValue: 12,
        outcome: 'WIN',
        outcomeReason: 'DEALER_BUST',
      }),
    ]);
  });

  it('confirms split by creating two playable hands on the same seat', () => {
    const service = createRiggedService([
      card('8', 'clubs'),
      card('5', 'clubs'),
      card('8', 'diamonds'),
      card('9', 'clubs'),
      card('2', 'clubs'),
      card('3', 'clubs'),
      card('10', 'clubs'),
    ]);

    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    confirmInitialBet({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'command-1',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
    });
    startActiveRoundOrFail(service);

    const reservation = service.reserveSplit({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'split-command-1',
    });
    const split = service.confirmSplit({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: reservation.commandId,
      roundId: reservation.roundId,
      roundSeatId: reservation.roundSeatId,
      sourceHandNo: reservation.sourceHandNo,
      newHandNo: reservation.newHandNo,
      amount: reservation.amount,
    });

    expect(reservation).toEqual({
      kind: 'reserved',
      tableId: 'main',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
      seatNo: 1,
      sourceHandNo: 1,
      newHandNo: 2,
      amount: 500n,
      commandId: 'split-command-1',
    });
    expect(split.state.round).toEqual({
      roundId: 'round-1',
      currentTurnSeatNo: 1,
      currentTurnHandNo: 1,
    });
    expect(split.state.seats[0]).toEqual(
      expect.objectContaining({
        betAmount: '1000',
        activeHandNo: 1,
        cards: [
          { rank: '8', suit: 'clubs' },
          { rank: '3', suit: 'clubs' },
        ],
        availableActions: ['HIT', 'STAND'],
      }),
    );
    expect(split.state.seats[0]?.hands).toEqual([
      expect.objectContaining({
        handNo: 1,
        betAmount: '500',
        cards: [
          { rank: '8', suit: 'clubs' },
          { rank: '3', suit: 'clubs' },
        ],
        isCurrentTurn: true,
        availableActions: ['HIT', 'STAND'],
      }),
      expect.objectContaining({
        handNo: 2,
        betAmount: '500',
        cards: [
          { rank: '8', suit: 'diamonds' },
          { rank: '2', suit: 'clubs' },
        ],
        isCurrentTurn: false,
        availableActions: [],
      }),
    ]);

    const firstStand = service.playerAction({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      action: 'STAND',
    });

    expect(firstStand.state.round).toEqual({
      roundId: 'round-1',
      currentTurnSeatNo: 1,
      currentTurnHandNo: 2,
    });

    const secondStand = service.playerAction({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      action: 'STAND',
    });

    expect(secondStand.event.type).toBe('PLAYER_ACTED');
    expect(secondStand.state.phase).toBe('DEALER_TURN');

    const dealerResult = advanceDealerTurnToSettlementOrFail(service);

    expect(dealerResult.settlement?.seats).toEqual([
      expect.objectContaining({
        roundSeatId: 'round-seat-1',
        handNo: 1,
        seatNo: 1,
        finalValue: 11,
        outcome: 'WIN',
        outcomeReason: 'DEALER_BUST',
      }),
      expect.objectContaining({
        roundSeatId: 'round-seat-1',
        handNo: 2,
        seatNo: 1,
        finalValue: 10,
        outcome: 'WIN',
        outcomeReason: 'DEALER_BUST',
      }),
    ]);
  });

  it('allows normal pairs to resplit up to four total hands by default', () => {
    const service = createRiggedService([
      card('8', 'clubs'),
      card('5', 'clubs'),
      card('8', 'diamonds'),
      card('9', 'clubs'),
      card('2', 'clubs'),
      card('8', 'hearts'),
      card('3', 'clubs'),
      card('8', 'spades'),
      card('4', 'clubs'),
      card('8', 'clubs'),
    ]);

    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    confirmInitialBet({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'command-1',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
    });
    startActiveRoundOrFail(service);

    const firstSplit = confirmSplitAction({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'split-command-1',
    });

    expect(firstSplit.state.seats[0]?.hands).toHaveLength(2);
    expect(firstSplit.state.seats[0]?.hands[0]).toEqual(
      expect.objectContaining({
        handNo: 1,
        cards: [
          { rank: '8', suit: 'clubs' },
          { rank: '8', suit: 'hearts' },
        ],
        availableActions: ['HIT', 'STAND', 'SPLIT'],
      }),
    );

    const secondSplit = confirmSplitAction({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'split-command-2',
    });

    expect(secondSplit.state.seats[0]?.hands).toHaveLength(3);
    expect(secondSplit.state.seats[0]?.hands[0]).toEqual(
      expect.objectContaining({
        handNo: 1,
        cards: [
          { rank: '8', suit: 'clubs' },
          { rank: '8', suit: 'spades' },
        ],
        availableActions: ['HIT', 'STAND', 'SPLIT'],
      }),
    );

    const thirdSplit = confirmSplitAction({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'split-command-3',
    });

    expect(thirdSplit.state.seats[0]).toEqual(
      expect.objectContaining({
        betAmount: '2000',
        activeHandNo: 1,
      }),
    );
    expect(thirdSplit.state.seats[0]?.hands).toHaveLength(4);
    expect(thirdSplit.state.seats[0]?.hands[0]).toEqual(
      expect.objectContaining({
        handNo: 1,
        cards: [
          { rank: '8', suit: 'clubs' },
          { rank: '8', suit: 'clubs' },
        ],
        availableActions: ['HIT', 'STAND'],
      }),
    );
  });

  it('stands split aces and blocks ace resplit by default', () => {
    const service = createRiggedService([
      card('A', 'clubs'),
      card('5', 'clubs'),
      card('A', 'diamonds'),
      card('9', 'clubs'),
      card('A', 'hearts'),
      card('A', 'spades'),
      card('4', 'clubs'),
    ]);

    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    confirmInitialBet({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'command-1',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
    });
    startActiveRoundOrFail(service);

    const split = confirmSplitAction({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'split-aces-command-1',
    });

    expect(split.event.type).toBe('PLAYER_ACTED');
    expect(split.state.phase).toBe('DEALER_TURN');
    expect(split.state.round).toEqual({
      roundId: 'round-1',
      currentTurnSeatNo: null,
      currentTurnHandNo: null,
    });
    expect(split.state.seats[0]?.hands).toEqual([
      expect.objectContaining({
        handNo: 1,
        handStatus: 'STOOD',
        cards: [
          { rank: 'A', suit: 'clubs' },
          { rank: 'A', suit: 'spades' },
        ],
        availableActions: [],
      }),
      expect.objectContaining({
        handNo: 2,
        handStatus: 'STOOD',
        cards: [
          { rank: 'A', suit: 'diamonds' },
          { rank: 'A', suit: 'hearts' },
        ],
        availableActions: [],
      }),
    ]);
  });

  it('confirms settlement results on the public table state', () => {
    const service = createDeterministicService();

    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    confirmInitialBet({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'command-1',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
    });
    startActiveRoundOrFail(service);
    service.playerAction({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      action: 'STAND',
    });
    advanceDealerTurnToSettlementOrFail(service);

    const result = service.confirmSettlement({
      tableId: 'main',
      roundId: 'round-1',
      seats: [
        {
          roundSeatId: 'round-seat-1',
          handNo: 1,
          seatNo: 1,
          outcome: 'LOSE',
          outcomeReason: 'STANDARD',
          payoutAmount: 0n,
          netAmount: -500n,
        },
      ],
    });

    expect(result.event.type).toBe('ROUND_SETTLED');
    expect(result.state.phase).toBe('SETTLED');
    expect(result.state.seats[0]).toEqual(
      expect.objectContaining({
        outcome: 'LOSE',
        outcomeReason: 'STANDARD',
        payoutAmount: '0',
        netAmount: '-500',
      }),
    );

    const reset = service.resetSettledRound({
      tableId: 'main',
      roundId: 'round-1',
    });

    expect(reset?.event.type).toBe('ROUND_RESET');
    expect(reset?.state.phase).toBe('WAITING_BETS');
    expect(reset?.state.round).toBeNull();
    expect(reset?.state.dealer).toEqual({
      cards: [],
      visibleScore: null,
      score: null,
    });
    expect(reset?.state.seats[0]).toEqual(
      expect.objectContaining({
        seatNo: 1,
        status: 'OCCUPIED',
        betAmount: null,
        handStatus: 'WAITING_BET',
        cards: [],
        score: null,
        isCurrentTurn: false,
        availableActions: [],
        activeHandNo: null,
        hands: [],
        outcome: null,
        outcomeReason: null,
        payoutAmount: null,
        netAmount: null,
      }),
    );

    const nextBet = confirmInitialBet({
      service,
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      commandId: 'command-2',
      roundId: 'round-2',
      roundSeatId: 'round-seat-2',
    });

    expect(nextBet.event.type).toBe('BET_PLACED');
    expect(nextBet.state.phase).toBe('WAITING_BETS');
    expect(nextBet.state.seats[0]).toEqual(
      expect.objectContaining({
        betAmount: '500',
        handStatus: 'BET_PLACED',
        hands: [],
        outcome: null,
      }),
    );
  });

  it('blocks leaving a seat with an active bet', () => {
    const service = new BlackjackTableService();

    service.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    service.reserveBet({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      amount: 500n,
      commandId: 'command-1',
    });
    service.confirmBet({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      amount: 500n,
      commandId: 'command-1',
      roundId: 'round-1',
      roundSeatId: 'round-seat-1',
    });

    expect(() =>
      service.leaveSeat({
        tableId: 'main',
        socketId: 'socket-alice',
        user: alice,
        seatNo: 1,
      }),
    ).toThrow(BlackjackTableError);
  });
});
