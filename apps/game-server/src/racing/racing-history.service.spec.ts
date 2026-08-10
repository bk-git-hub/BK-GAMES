import { buildRacingHistoryQuery } from './racing-history.service';

describe('buildRacingHistoryQuery', () => {
  it('builds a latest-results query without a date boundary by default', () => {
    expect(
      buildRacingHistoryQuery({ tableCode: 'main', limit: 50 }),
    ).toEqual({
      date: null,
      query: {
        tableCode: 'main',
        limit: 50,
      },
    });
  });

  it('builds Korea calendar-day boundaries when a date is requested', () => {
    expect(
      buildRacingHistoryQuery({
        tableCode: 'main',
        date: '2026-08-10',
        limit: 8,
      }),
    ).toEqual({
      date: '2026-08-10',
      query: {
        tableCode: 'main',
        from: new Date('2026-08-09T15:00:00.000Z'),
        to: new Date('2026-08-10T15:00:00.000Z'),
        limit: 8,
      },
    });
  });
});
