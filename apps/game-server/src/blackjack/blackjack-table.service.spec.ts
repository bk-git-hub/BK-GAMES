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
    getAvailablePlayerActions: (context: { cards: readonly MockCard[] }) => {
      const hand = evaluateHand(context.cards);

      return hand.isBust || hand.isBlackjack ? [] : ['HIT', 'STAND'];
    },
  };
});

import {
  BlackjackTableError,
  BlackjackTableService,
} from './blackjack-table.service';

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

  it('confirms a reserved bet and starts a one-seat round', () => {
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

    expect(betPlaced.event.type).toBe('ROUND_STARTED');
    expect(betPlaced.state.phase).toBe('PLAYER_TURNS');
    expect(betPlaced.state.round).toEqual({
      roundId: 'round-1',
      currentTurnSeatNo: 1,
    });
    expect(betPlaced.state.dealer).toEqual({
      cards: [
        { rank: '3', suit: 'clubs' },
        { rank: '5', suit: 'clubs', hidden: true },
      ],
      visibleScore: 3,
      score: null,
    });
    expect(betPlaced.state.seats).toEqual([
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
        availableActions: ['HIT', 'STAND'],
      }),
    ]);
  });

  it('waits for all occupied seats to bet before dealing', () => {
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
    expect(secondBet.event.type).toBe('ROUND_STARTED');
    expect(secondBet.state.round).toEqual({
      roundId: 'round-1',
      currentTurnSeatNo: 1,
    });
    expect(secondBet.state.dealer.cards).toEqual([
      { rank: '4', suit: 'clubs' },
      { rank: '7', suit: 'clubs', hidden: true },
    ]);
    expect(secondBet.state.seats).toEqual([
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

    const result = service.playerAction({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
      action: 'STAND',
    });

    expect(result.event.type).toBe('DEALER_PLAYED');
    expect(result.state.phase).toBe('SETTLING');
    expect(result.state.round).toEqual({
      roundId: 'round-1',
      currentTurnSeatNo: null,
    });
    expect(result.state.seats[0]).toEqual(
      expect.objectContaining({
        handStatus: 'STOOD',
        isCurrentTurn: false,
        availableActions: [],
      }),
    );
    expect(result.state.dealer).toEqual({
      cards: [
        { rank: '3', suit: 'clubs' },
        { rank: '5', suit: 'clubs' },
        { rank: '6', suit: 'clubs' },
        { rank: '7', suit: 'clubs' },
      ],
      visibleScore: 21,
      score: 21,
    });
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
