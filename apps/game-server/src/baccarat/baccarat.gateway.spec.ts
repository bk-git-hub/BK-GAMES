jest.mock('./baccarat-engine.port', () => ({
  buildBaccaratRoadmaps: () => ({
    beadPlate: [],
    bigRoad: [],
    leadingTies: [],
  }),
  dealBaccaratRound: jest.fn(),
  getBaccaratCardValue: jest.fn(() => 0),
}));

jest.mock('@bk-games/shared', () => ({
  BACCARAT_CLIENT_EVENTS: {
    BET_PLACE: 'bet:place',
    SQUEEZE_COMPLETE: 'squeeze:complete',
    SQUEEZE_PROGRESS: 'squeeze:progress',
    TABLE_JOIN: 'table:join',
    TABLE_LEAVE: 'table:leave',
  },
  BACCARAT_NAMESPACE: '/baccarat',
  BACCARAT_SERVER_EVENTS: {
    BET_ACCEPTED: 'bet:accepted',
    BET_REJECTED: 'bet:rejected',
    CARD_REVEALED: 'card:revealed',
    ERROR: 'error',
    ROUND_SETTLED: 'round:settled',
    SQUEEZE_PROGRESS: 'squeeze:progressed',
    TABLE_EVENT: 'table:event',
    TABLE_STATE: 'table:state',
    WALLET_UPDATED: 'wallet:updated',
  },
  baccaratTableRoom: (tableId: string) => `baccarat:table:${tableId}`,
  baccaratUserRoom: (userId: string) => `baccarat:user:${userId}`,
}));

import { BaccaratGateway } from './baccarat.gateway';

describe('BaccaratGateway idle runtime', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not create or load a table snapshot during gateway bootstrap', () => {
    const tableConfigService = {
      getRuntimeSnapshot: jest.fn(),
    };
    const tableService = {
      hasLiveBets: jest.fn(() => false),
      hasTable: jest.fn(() => false),
      getViewerCount: jest.fn(() => 0),
    };
    const gateway = new BaccaratGateway(
      tableConfigService as never,
      tableService as never,
      {} as never,
      {} as never,
    );

    gateway.afterInit();

    expect(tableConfigService.getRuntimeSnapshot).not.toHaveBeenCalled();
  });
});

describe('BaccaratGateway disconnect auto reveal', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports a failed auto reveal instead of leaving the rejection unhandled', async () => {
    const tableConfigService = {
      markRevealCompleted: jest.fn(() =>
        Promise.reject(new Error('Connection terminated unexpectedly')),
      ),
    };
    const tableService = {
      completeActiveReveal: jest.fn(() => ({
        state: { tableId: 'main', phase: 'SQUEEZE' },
        cardRevealed: {
          card: { rank: 'A', suit: 'SPADES' },
          createdAt: '2026-06-18T12:00:00.000Z',
        },
      })),
      disconnectSocket: jest.fn(() => [
        {
          state: { tableId: 'main' },
          event: { actorUserId: 'user-1' },
        },
      ]),
      getAutoRevealAfterDisconnectedUser: jest.fn(() => ({
        tableId: 'main',
        roundId: 'round-1',
        revealId: 'reveal-1',
      })),
    };
    const emit = jest.fn();
    const gateway = new BaccaratGateway(
      tableConfigService as never,
      tableService as never,
      {} as never,
      {} as never,
    );
    gateway.server = { to: jest.fn(() => ({ emit })) } as never;
    jest
      .spyOn(
        gateway as unknown as { emitTableUpdate(update: unknown): void },
        'emitTableUpdate',
      )
      .mockImplementation(() => undefined);

    gateway.handleDisconnect({ id: 'socket-1' } as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(tableConfigService.markRevealCompleted).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('error', {
      code: 'UNKNOWN_ERROR',
      message: 'Unexpected baccarat disconnect reveal error.',
    });
  });
});
