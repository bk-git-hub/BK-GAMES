import type { RacingTableState } from '@bk-games/shared';
import { buildRaceTick } from './racing-race-tick';
import { RacingGateway } from './racing.gateway';

jest.mock('@bk-games/shared', () => ({
  RACING_CLIENT_EVENTS: {
    BET_PLACE: 'bet:place',
    TABLE_JOIN: 'table:join',
  },
  RACING_NAMESPACE: '/racing',
  RACING_SERVER_EVENTS: {
    ERROR: 'error',
    TABLE_EVENT: 'table:event',
    TABLE_STATE: 'table:state',
    WALLET_UPDATED: 'wallet:updated',
  },
  racingTableRoom: (tableId: string) => `racing:table:${tableId}`,
  racingUserRoom: (userId: string) => `racing:user:${userId}`,
}));

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
    const tick = buildTickAtElapsedMs(state, 25_000);

    expect(tick.positions.every((position) => position.progress === 1)).toBe(
      true,
    );
    expect(tick.positions.map((position) => position.rank)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });
});

describe('RacingGateway race tick loop', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-18T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('emits running race ticks at the table tick interval', () => {
    const state = createRunningState({
      startedAt: '2026-06-18T12:00:00.000Z',
    });
    const tableService = createTableServiceMock(state);
    const { emit, server } = createServerMock();
    const gateway = new RacingGateway(
      {} as never,
      tableService as never,
      {} as never,
      {} as never,
    );
    gateway.server = server;

    getGatewayHarness(gateway).ensureRaceTickLoop(state);

    expect(tableService.recordRaceTick).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(350);

    expect(tableService.recordRaceTick).toHaveBeenCalledTimes(4);

    const tickEvents = emit.mock.calls
      .filter(([eventName]) => eventName === 'table:event')
      .map(([, payload]) => payload)
      .filter((payload) => payload.type === 'RACE_TICK');

    expect(tickEvents).toHaveLength(4);
    expect(tickEvents.map((event) => event.tick.elapsedMs)).toEqual([
      0, 100, 200, 300,
    ]);

    gateway.onModuleDestroy();
    jest.advanceTimersByTime(300);

    expect(tableService.recordRaceTick).toHaveBeenCalledTimes(4);
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
      roundEndDelaySeconds: 35,
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

function createTableServiceMock(state: RacingTableState) {
  const recordRaceTick = jest.fn(
    (input: { tick: ReturnType<typeof buildRaceTick> }) => ({
      state,
      event: {
        tableId: state.tableId,
        type: 'RACE_TICK',
        actorUserId: 'SYSTEM',
        raceId: input.tick.raceId,
        tick: input.tick,
        stateVersion: state.version,
        createdAt: new Date().toISOString(),
      },
    }),
  );

  return {
    getTableState: jest.fn(() => state),
    recordRaceTick,
  };
}

function createServerMock() {
  const emit = jest.fn();
  const server = {
    to: jest.fn(() => ({ emit })),
  } as never;

  return { emit, server };
}

function getGatewayHarness(gateway: RacingGateway) {
  return gateway as unknown as {
    ensureRaceTickLoop(state: RacingTableState): void;
  };
}
