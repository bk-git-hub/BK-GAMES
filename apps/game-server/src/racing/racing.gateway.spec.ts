import type {
  RacingRaceEntrySnapshot,
  RacingTableState,
} from '@bk-games/shared';
import { buildRaceTick } from './racing-race-tick';

describe('buildRaceTick', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('orders tick ranks with the same deterministic seed as race settlement', () => {
    const now = Date.parse('2026-06-18T12:00:26.000Z');
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const state = createRunningState({
      startedAt: '2026-06-18T12:00:00.000Z',
    });
    const tick = buildRaceTick(state);
    const expectedOrder = expectedSettlementOrder(
      state.race!.raceId,
      state.race!.raceNo,
      state.race!.entries,
    );

    expect(tick.positions.map((position) => position.raceEntryId)).toEqual(
      expectedOrder,
    );
    expect(tick.positions.map((position) => position.rank)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it('keeps higher ranked entries ahead in progress during the race', () => {
    const now = Date.parse('2026-06-18T12:00:26.000Z');
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const tick = buildRaceTick(
      createRunningState({
        startedAt: '2026-06-18T12:00:00.000Z',
      }),
    );

    expect(tick.positions).toEqual(
      [...tick.positions].sort((left, right) => right.progress - left.progress),
    );
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
    betTypes: ['WIN', 'QUINELLA', 'EXACTA'],
    timing: {
      bettingTimeoutSeconds: 150,
      raceIntervalSeconds: 240,
      raceAndResultSeconds: 60,
      bettingCloseBeforeStartSeconds: 30,
      tickIntervalMs: 100,
      raceDistanceM: 1200,
      roundEndDelaySeconds: 8,
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

function expectedSettlementOrder(
  raceId: string,
  raceNo: number,
  entries: RacingRaceEntrySnapshot[],
) {
  return entries
    .map((entry) => ({
      raceEntryId: entry.raceEntryId,
      score: deterministicScore(
        `${raceId}:${raceNo}:${entry.raceEntryId}:${entry.number}`,
      ),
    }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.raceEntryId);
}

function deterministicScore(seed: string) {
  let hash = 2_166_136_261;

  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}
