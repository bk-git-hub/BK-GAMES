import type { RacingTableState } from '@bk-games/shared';
import { buildRaceTick } from './racing-race-tick';

describe('buildRaceTick', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows race ranks to change across simulation ticks', () => {
    const state = createRunningState({
      startedAt: '2026-06-18T12:00:00.000Z',
    });
    const orders = [5_000, 15_000, 28_000, 40_000].map((elapsedMs) =>
      buildTickOrderAtElapsedMs(state, elapsedMs),
    );
    const uniqueOrders = new Set(orders.map((order) => order.join(',')));

    expect(uniqueOrders.size).toBeGreaterThan(1);
  });

  it('marks every runner as finished by the final race tick', () => {
    const state = createRunningState({
      startedAt: '2026-06-18T12:00:00.000Z',
    });
    const tick = buildTickAtElapsedMs(state, 43_000);

    expect(tick.positions.every((position) => position.progress === 1)).toBe(
      true,
    );
    expect(tick.positions.map((position) => position.rank)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });
});

function createRunningState(input: { startedAt: string }): RacingTableState {
  const raceId = 'race-main-42';
  const scheduledStartAt = input.startedAt;
  const entries = Array.from({ length: 6 }, (_, index) => {
    const number = index + 1;

    return {
      raceEntryId: `entry-${number}`,
      horseId: `horse-${number}`,
      name: `Horse ${number}`,
      silkColor: '#123456',
      number,
      gateNo: number,
      lane: number,
      finalRank: null,
      finishedAtMs: null,
    };
  });

  return {
    tableId: 'main',
    status: 'OPEN',
    phase: 'RUNNING',
    fieldSize: entries.length,
    viewerCount: 1,
    bettingLimits: {
      minBet: '100',
      maxBet: '6000',
    },
    betTypes: [
      'WIN',
      'PLACE',
      'QUINELLA',
      'EXACTA',
      'QUINELLA_PLACE',
      'TRIO',
      'TRIFECTA',
    ],
    timing: {
      bettingTimeoutSeconds: 150,
      raceIntervalSeconds: 240,
      raceAndResultSeconds: 60,
      bettingCloseBeforeStartSeconds: 30,
      tickIntervalMs: 100,
      raceDistanceM: 1200,
      roundEndDelaySeconds: 17,
    },
    horses: entries.map((entry) => ({
      horseId: entry.horseId,
      name: entry.name,
      silkColor: entry.silkColor,
      number: entry.number,
    })),
    race: {
      raceId,
      raceNo: 42,
      status: 'RUNNING',
      phase: 'RUNNING',
      scheduledStartAt,
      bettingOpensAt: '2026-06-18T11:57:00.000Z',
      bettingClosesAt: '2026-06-18T11:59:30.000Z',
      startedAt: input.startedAt,
      finishedAt: null,
      settledAt: null,
      resultOrder: [],
      entries,
    },
    timers: {
      scheduledStartAt,
      bettingClosesAt: '2026-06-18T11:59:30.000Z',
    },
    version: 1,
    updatedAt: input.startedAt,
  };
}

function buildTickOrderAtElapsedMs(state: RacingTableState, elapsedMs: number) {
  return buildTickAtElapsedMs(state, elapsedMs).positions.map(
    (position) => position.raceEntryId,
  );
}

function buildTickAtElapsedMs(state: RacingTableState, elapsedMs: number) {
  const startedAt = Date.parse(state.race!.startedAt!);

  jest.spyOn(Date, 'now').mockReturnValue(startedAt + elapsedMs);

  return buildRaceTick(state);
}
