jest.mock('./baccarat-engine.port', () => ({
  buildBaccaratRoadmaps: (rounds: Array<Record<string, unknown>>) => ({
    beadPlate: rounds.map((round, index) => ({
      ...round,
      row: index % 6,
      col: Math.floor(index / 6),
    })),
    bigRoad: [],
    leadingTies: [],
  }),
  getBaccaratCardValue: (card: { rank: string }) => {
    if (card.rank === 'A') {
      return 1;
    }

    if (
      card.rank === '10' ||
      card.rank === 'J' ||
      card.rank === 'Q' ||
      card.rank === 'K'
    ) {
      return 0;
    }

    return Number(card.rank);
  },
}));

import {
  BaccaratTableError,
  BaccaratTableService,
} from './baccarat-table.service';
import type {
  BaccaratConfigureTableInput,
  BaccaratRuntimeBetSnapshot,
  BaccaratRuntimeRevealSnapshot,
  BaccaratRuntimeRoundSnapshot,
  BaccaratTableConfig,
} from './baccarat-table.service';
import type { BaccaratCard } from './baccarat-engine.port';

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

describe('BaccaratTableService', () => {
  it('keeps unrevealed cards hidden in table state', () => {
    const service = new BaccaratTableService();
    const configured = service.configureTable(createConfiguredTable());

    expect(configured?.state.phase).toBe('DEALING');
    expect(configured?.state.player.total).toBeNull();
    expect(configured?.state.banker.total).toBeNull();
    expect(configured?.state.player.cards[0]).toEqual({
      slot: 'PLAYER_CARD_1',
      hidden: true,
    });
    expect(configured?.state.banker.cards[0]).toEqual({
      slot: 'BANKER_CARD_1',
      hidden: true,
    });
    expect(configured?.state.player.cards[0]).not.toHaveProperty('rank');
    expect(configured?.state.banker.cards[0]).not.toHaveProperty('value');
  });

  it('starts automatic fast reveal and keeps later cards hidden after completion', () => {
    const service = new BaccaratTableService();
    const startedAt = new Date('2026-07-06T00:00:00.000Z');

    service.configureTable(createConfiguredTable({ bets: [aliceBet(), bobBet()] }));
    service.joinTable({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
    });
    service.joinTable({
      tableId: 'main',
      socketId: 'socket-bob',
      user: bob,
    });

    const squeeze = service.startNextReveal({
      tableId: 'main',
      now: startedAt,
    });

    expect(squeeze?.state.reveal).toEqual(
      expect.objectContaining({
        slot: 'PLAYER_CARD_1',
        squeezerUserId: null,
        status: 'ACTIVE',
        startedAt: '2026-07-06T00:00:00.000Z',
        endsAt: '2026-07-06T00:00:01.500Z',
        isAutoReveal: true,
      }),
    );
    expect(squeeze?.event?.actorUserId).toBe('SYSTEM');
    expect(service.isAutomaticRevealActive({
      tableId: 'main',
      roundId: 'round-1',
      revealId: 'reveal-player-1',
    })).toBe(true);

    const revealed = service.completeActiveReveal({
      tableId: 'main',
      roundId: 'round-1',
      revealId: 'reveal-player-1',
      system: true,
      now: new Date('2026-07-06T00:00:03.000Z'),
    });

    expect(revealed.cardRevealed?.card).toEqual({
      slot: 'PLAYER_CARD_1',
      rank: 'A',
      suit: 'clubs',
      value: 1,
      hidden: false,
    });
    expect(revealed.state.player.cards[0]).toEqual({
      slot: 'PLAYER_CARD_1',
      rank: 'A',
      suit: 'clubs',
      value: 1,
      hidden: false,
    });
    expect(revealed.state.banker.cards[0]).toEqual({
      slot: 'BANKER_CARD_1',
      hidden: true,
    });
    expect(revealed.state.banker.cards[0]).not.toHaveProperty('rank');
  });

  it('keeps myBet out of public table state and exposes it for the viewer only', () => {
    const service = new BaccaratTableService();

    service.configureTable(createConfiguredTable());
    service.recordBetAccepted({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      commandId: 'command-alice',
      bet: aliceBet(),
    });

    expect(service.getTableState('main').betting.myBet).toBeNull();
    expect(service.getTableState('main', alice.userId).betting.myBet).toEqual(
      expect.objectContaining({
        betId: 'bet-alice',
        betType: 'PLAYER',
        amount: '100',
      }),
    );
  });

  it('ignores client squeeze progress while automatic reveal is active', () => {
    const service = new BaccaratTableService();

    service.configureTable(createConfiguredTable({ bets: [aliceBet(), bobBet()] }));
    service.joinTable({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
    });
    service.joinTable({
      tableId: 'main',
      socketId: 'socket-bob',
      user: bob,
    });

    const squeeze = service.startNextReveal({
      tableId: 'main',
      now: new Date('2026-07-06T00:00:00.000Z'),
    });

    expect(squeeze?.state.reveal).toEqual(
      expect.objectContaining({
        revealId: 'reveal-player-1',
        squeezerUserId: null,
        isAutoReveal: true,
      }),
    );

    const ignored = service.recordSqueezeProgress({
      tableId: 'main',
      roundId: 'round-1',
      revealId: 'reveal-player-1',
      user: alice,
      progress: 50,
    });

    expect(ignored.event).toBeUndefined();
    expect(ignored.squeezeProgressed).toBeUndefined();
    expect(ignored.state.reveal).toEqual(
      expect.objectContaining({
        revealId: 'reveal-player-1',
        squeezerUserId: null,
        progress: 0,
        isAutoReveal: true,
      }),
    );

    const state = service.getTableState('main');

    expect(state.player.cards[0]).toEqual({
      slot: 'PLAYER_CARD_1',
      hidden: true,
    });
    expect(state.player.cards[0]).not.toHaveProperty('rank');
  });

  it('keeps selected-squeezer validation for legacy active reveal snapshots', () => {
    const service = new BaccaratTableService();

    service.configureTable(
      createConfiguredTable({
        round: createRound({ status: 'SQUEEZE' }),
        reveals: createLegacySqueezerReveals(),
        bets: [aliceBet(), bobBet()],
      }),
    );
    service.joinTable({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
    });
    service.joinTable({
      tableId: 'main',
      socketId: 'socket-bob',
      user: bob,
    });

    expectBaccaratErrorCode(
      () =>
        service.completeActiveReveal({
          tableId: 'main',
          roundId: 'round-1',
          revealId: 'reveal-player-1',
          user: alice,
        }),
      'NOT_SQUEEZER',
    );

    const state = service.getTableState('main');

    expect(state.player.cards[0]).toEqual({
      slot: 'PLAYER_CARD_1',
      hidden: true,
    });
    expect(state.player.cards[0]).not.toHaveProperty('rank');
    expect(state.reveal).toEqual(
      expect.objectContaining({
        revealId: 'reveal-player-1',
        squeezerUserId: bob.userId,
        status: 'ACTIVE',
        progress: 0,
      }),
    );
  });

  it('creates reconnect-safe snapshots with only revealed cards visible', () => {
    const service = new BaccaratTableService();

    service.configureTable(
      createConfiguredTable({
        round: createRound({ status: 'SQUEEZE' }),
        reveals: createReconnectReveals(),
        bets: [bobBet()],
      }),
    );

    const publicState = service.getTableState('main');

    expect(publicState.phase).toBe('SQUEEZE');
    expect(publicState.round?.outcome).toBeNull();
    expect(publicState.player.cards[0]).toEqual({
      slot: 'PLAYER_CARD_1',
      rank: 'A',
      suit: 'clubs',
      value: 1,
      hidden: false,
    });
    expect(publicState.banker.cards[0]).toEqual({
      slot: 'BANKER_CARD_1',
      hidden: true,
    });
    expect(publicState.banker.cards[0]).not.toHaveProperty('rank');
    expect(publicState.reveal).toEqual(
      expect.objectContaining({
        revealId: 'reveal-banker-1',
        slot: 'BANKER_CARD_1',
        squeezerUserId: null,
        status: 'ACTIVE',
        progress: 40,
        isAutoReveal: true,
      }),
    );
    expect(publicState.squeeze).toEqual(
      expect.objectContaining({
        revealId: 'reveal-banker-1',
        status: 'ACTIVE',
        progress: 40,
        isAutoReveal: true,
      }),
    );
    expect(publicState.betting.myBet).toBeNull();

    service.joinTable({
      tableId: 'main',
      socketId: 'socket-bob-reconnect',
      user: bob,
    });

    expect(service.getTableState('main', bob.userId).betting.myBet).toEqual(
      expect.objectContaining({
        betId: 'bet-bob',
        betType: 'BANKER',
        amount: '500',
      }),
    );
  });

  it('auto-reveals when the active squeezer fully disconnects', () => {
    const service = new BaccaratTableService();

    service.configureTable(
      createConfiguredTable({
        round: createRound({ status: 'SQUEEZE' }),
        reveals: createLegacySqueezerReveals(),
        bets: [bobBet()],
      }),
    );
    service.joinTable({
      tableId: 'main',
      socketId: 'socket-bob-primary',
      user: bob,
    });
    service.joinTable({
      tableId: 'main',
      socketId: 'socket-bob-backup',
      user: bob,
    });

    service.disconnectSocket('socket-bob-primary');

    expect(
      service.getAutoRevealAfterDisconnectedUser('main', bob.userId),
    ).toBeNull();

    service.disconnectSocket('socket-bob-backup');

    expect(service.getAutoRevealAfterDisconnectedUser('main', bob.userId)).toEqual({
      tableId: 'main',
      roundId: 'round-1',
      revealId: 'reveal-player-1',
    });

    const revealed = service.completeActiveReveal({
      tableId: 'main',
      roundId: 'round-1',
      revealId: 'reveal-player-1',
      system: true,
      now: new Date('2026-07-06T00:00:05.000Z'),
    });

    expect(revealed.cardRevealed?.card).toEqual({
      slot: 'PLAYER_CARD_1',
      rank: 'A',
      suit: 'clubs',
      value: 1,
      hidden: false,
    });
    expect(revealed.event?.actorUserId).toBe('SYSTEM');
  });
});

function createConfiguredTable(
  overrides: Partial<BaccaratConfigureTableInput> = {},
): BaccaratConfigureTableInput {
  return {
    tableId: 'main',
    config: createConfig(),
    shoe: {
      shoeId: 'shoe-1',
      shoeNo: 1,
      deckCount: 8,
      cardsDealt: 4,
      cardsRemaining: 412,
      penetrationPercent: 0,
      willShuffleAfterRound: false,
    },
    round: createRound(),
    reveals: createReveals(),
    bets: [],
    recentRounds: [],
    ...overrides,
  };
}

function createConfig(): BaccaratTableConfig {
  return {
    status: 'OPEN',
    minBet: 100n,
    maxMainBet: 6000n,
    maxTotalBetPerUser: 6000n,
    bettingTimeoutSeconds: 15,
    squeezeTimeoutSeconds: 8,
    roundEndDelaySeconds: 5,
    deckCount: 8,
    shoePenetrationPercent: 75,
    minimumCardsBeforeRound: 6,
    resultHistoryLimit: 72,
    tiePayoutNumerator: 8,
    tiePayoutDenominator: 1,
    bankerCommissionBps: 500,
    betTypes: ['PLAYER', 'BANKER', 'TIE'],
  };
}

function createRound(
  overrides: Partial<BaccaratRuntimeRoundSnapshot> = {},
): BaccaratRuntimeRoundSnapshot {
  return {
    roundId: 'round-1',
    shoeId: 'shoe-1',
    roundNo: 1,
    status: 'DEALING',
    bettingOpensAt: '2026-07-06T00:00:00.000Z',
    bettingClosesAt: '2026-07-06T00:00:15.000Z',
    playerCards: [card('A'), card('7', 'hearts')],
    bankerCards: [card('9', 'spades'), card('4', 'diamonds')],
    playerTotal: 8,
    bankerTotal: 3,
    outcome: 'PLAYER',
    isNatural: true,
    totalCards: 4,
    ...overrides,
  };
}

function createReveals(): BaccaratRuntimeRevealSnapshot[] {
  return [
    {
      revealId: 'reveal-player-1',
      slot: 'PLAYER_CARD_1',
      status: 'PENDING',
      sequence: 1,
      squeezerUserId: null,
      progress: 0,
      startedAt: null,
      endsAt: null,
      revealedAt: null,
      card: null,
    },
    {
      revealId: 'reveal-banker-1',
      slot: 'BANKER_CARD_1',
      status: 'PENDING',
      sequence: 2,
      squeezerUserId: null,
      progress: 0,
      startedAt: null,
      endsAt: null,
      revealedAt: null,
      card: null,
    },
    {
      revealId: 'reveal-player-2',
      slot: 'PLAYER_CARD_2',
      status: 'PENDING',
      sequence: 3,
      squeezerUserId: null,
      progress: 0,
      startedAt: null,
      endsAt: null,
      revealedAt: null,
      card: null,
    },
    {
      revealId: 'reveal-banker-2',
      slot: 'BANKER_CARD_2',
      status: 'PENDING',
      sequence: 4,
      squeezerUserId: null,
      progress: 0,
      startedAt: null,
      endsAt: null,
      revealedAt: null,
      card: null,
    },
  ];
}

function createReconnectReveals(): BaccaratRuntimeRevealSnapshot[] {
  return createReveals().map((reveal) => {
    if (reveal.revealId === 'reveal-player-1') {
      return {
        ...reveal,
        status: 'REVEALED',
        progress: 100,
        revealedAt: '2026-07-06T00:00:03.000Z',
        card: card('A'),
      };
    }

    if (reveal.revealId === 'reveal-banker-1') {
      return {
        ...reveal,
        status: 'ACTIVE',
        squeezerUserId: null,
        progress: 40,
        startedAt: '2026-07-06T00:00:03.000Z',
        endsAt: '2026-07-06T00:00:04.500Z',
      };
    }

    return reveal;
  });
}

function createLegacySqueezerReveals(): BaccaratRuntimeRevealSnapshot[] {
  return createReveals().map((reveal) => {
    if (reveal.revealId === 'reveal-player-1') {
      return {
        ...reveal,
        status: 'ACTIVE',
        squeezerUserId: bob.userId,
        progress: 0,
        startedAt: '2026-07-06T00:00:00.000Z',
        endsAt: '2026-07-06T00:00:08.000Z',
      };
    }

    return reveal;
  });
}

function aliceBet(): BaccaratRuntimeBetSnapshot {
  return {
    betId: 'bet-alice',
    userId: alice.userId,
    nickname: alice.nickname,
    betType: 'PLAYER',
    amount: 100n,
    status: 'PLACED',
    payoutAmount: 0n,
    netAmount: -100n,
    commandId: 'command-alice',
    createdAt: '2026-07-06T00:00:01.000Z',
  };
}

function bobBet(): BaccaratRuntimeBetSnapshot {
  return {
    betId: 'bet-bob',
    userId: bob.userId,
    nickname: bob.nickname,
    betType: 'BANKER',
    amount: 500n,
    status: 'PLACED',
    payoutAmount: 0n,
    netAmount: -500n,
    commandId: 'command-bob',
    createdAt: '2026-07-06T00:00:02.000Z',
  };
}

function card(
  rank: BaccaratCard['rank'],
  suit: BaccaratCard['suit'] = 'clubs',
): BaccaratCard {
  return { rank, suit };
}

function expectBaccaratErrorCode(
  operation: () => unknown,
  code: BaccaratTableError['code'],
) {
  let error: unknown;

  try {
    operation();
  } catch (caught) {
    error = caught;
  }

  expect(error).toBeInstanceOf(BaccaratTableError);
  expect((error as BaccaratTableError).code).toBe(code);
}
