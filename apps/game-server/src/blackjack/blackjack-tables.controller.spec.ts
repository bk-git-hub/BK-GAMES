jest.mock('./blackjack-engine.port', () => ({
  createDeck: () => [],
  evaluateHand: () => ({
    total: 0,
    isSoft: false,
    isBust: false,
    isBlackjack: false,
  }),
  getAvailablePlayerActions: () => [],
  shouldDealerHit: () => false,
  shuffleDeck: (cards: unknown[]) => [...cards],
}));

import { BlackjackTableConfigService } from './blackjack-table-config.service';
import {
  BlackjackTableService,
  type BlackjackTableConfig,
} from './blackjack-table.service';
import { BlackjackTablesController } from './blackjack-tables.controller';

const alice = {
  userId: 'user-alice',
  nickname: 'Alice',
  role: 'USER' as const,
};

describe('BlackjackTablesController', () => {
  it('returns live table seat availability for the lobby', async () => {
    const config = buildTableConfig({ maxSeats: 3, maxSeatsPerUser: 3 });
    const tableService = new BlackjackTableService();
    const getTableConfig = jest.fn<Promise<BlackjackTableConfig>, [string]>();
    const tableConfigService: BlackjackTableConfigService = {
      getTableConfig,
    };
    const controller = new BlackjackTablesController(
      tableConfigService,
      tableService,
    );

    getTableConfig.mockResolvedValue(config);
    tableService.configureTable({ tableId: 'main', config });
    tableService.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    tableService.takeSeat({
      tableId: 'main',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 3,
    });

    await expect(controller.listTables()).resolves.toEqual({
      tables: [
        expect.objectContaining({
          tableId: 'main',
          gameType: 'BLACKJACK',
          status: 'OPEN',
          phase: 'WAITING_BETS',
          maxSeats: 3,
          occupiedSeats: 2,
          availableSeats: 1,
          occupiedSeatNos: [1, 3],
          availableSeatNos: [2],
          bettingLimits: {
            minInitialBet: '100',
            maxInitialBet: '6000',
            maxTotalBetPerSeat: '24000',
            maxTotalBetPerUser: '42000',
          },
        }),
      ],
    });
    expect(getTableConfig).toHaveBeenCalledWith('main');
  });
});

function buildTableConfig(
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
    deckCount: 6,
    dealerHitsSoft17: false,
    insuranceAllowed: false,
    evenMoneyAllowed: false,
    doubleAllowed: true,
    splitAllowed: true,
    doubleAfterSplitAllowed: false,
    allowTenValueSplit: true,
    maxSplitHands: 4,
    resplitAcesAllowed: false,
    hitSplitAcesAllowed: false,
    surrenderMode: 'LATE',
    bettingWindowMs: 20_000,
    ...overrides,
  };
}
