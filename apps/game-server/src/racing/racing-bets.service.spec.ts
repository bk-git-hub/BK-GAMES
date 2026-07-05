import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RacingBetsService } from './racing-bets.service';

const db = {
  getRacingTableByCode: jest.fn(),
  listUserRacingBets: jest.fn(),
};

describe('RacingBetsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.getRacingTableByCode.mockResolvedValue({ id: 'table-1' });
    db.listUserRacingBets.mockResolvedValue([]);
  });

  it('returns only the authenticated user bet history from the DB helper', async () => {
    const service = new TestRacingBetsService();
    db.listUserRacingBets.mockResolvedValue([
      {
        bet: {
          id: 'bet-1',
          raceId: 'race-1',
          raceNo: 225,
          tableCode: 'main',
          betType: 'EXACTA',
          status: 'PLACED',
          amount: 100n,
          payoutAmount: 0n,
          createdAt: new Date('2026-07-05T00:00:00.000Z'),
          settledAt: null,
        },
        selections: [
          {
            betId: 'bet-1',
            raceEntryId: 'entry-3',
            entryNo: 3,
            displayName: 'Copper Meridian',
            selectionOrder: 1,
          },
          {
            betId: 'bet-1',
            raceEntryId: 'entry-1',
            entryNo: 1,
            displayName: 'Crimson Circuit',
            selectionOrder: 2,
          },
        ],
      },
    ]);

    await expect(
      service.listUserBets({
        userId: 'user-1',
        tableId: 'main',
        limit: '20',
      }),
    ).resolves.toEqual({
      bets: [
        {
          betId: 'bet-1',
          raceId: 'race-1',
          raceNo: 225,
          tableId: 'main',
          betType: 'EXACTA',
          amount: '100',
          status: 'PLACED',
          payoutAmount: '0',
          createdAt: '2026-07-05T00:00:00.000Z',
          settledAt: null,
          selections: [
            {
              raceEntryId: 'entry-3',
              entryNo: 3,
              displayName: 'Copper Meridian',
            },
            {
              raceEntryId: 'entry-1',
              entryNo: 1,
              displayName: 'Crimson Circuit',
            },
          ],
        },
      ],
    });

    expect(db.getRacingTableByCode).toHaveBeenCalledWith('main');
    expect(db.listUserRacingBets).toHaveBeenCalledWith({
      tableCode: 'main',
      userId: 'user-1',
      limit: 20,
    });
  });

  it('rejects unknown tables before reading user bets', async () => {
    const service = new TestRacingBetsService();
    db.getRacingTableByCode.mockResolvedValue(null);

    await expect(
      service.listUserBets({ userId: 'user-1', tableId: 'missing' }),
    ).rejects.toThrow(NotFoundException);

    expect(db.listUserRacingBets).not.toHaveBeenCalled();
  });

  it('rejects invalid query parameters', async () => {
    const service = new TestRacingBetsService();

    await expect(
      service.listUserBets({ userId: 'user-1', tableId: '../main' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.listUserBets({ userId: 'user-1', limit: '0' }),
    ).rejects.toThrow(BadRequestException);
  });
});

class TestRacingBetsService extends RacingBetsService {
  protected override async loadDb() {
    return db as never;
  }
}
