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
