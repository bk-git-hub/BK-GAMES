import { io } from 'socket.io-client';
import {
  applyWalletMutation,
  authUsers,
  db,
  ensureUserGameAccount,
  pool,
} from '@bk-games/db';

type RacingTableResponse = {
  tables: Array<{
    tableId: string;
    phase: string;
    race: {
      raceId: string;
      entries: Array<{
        raceEntryId: string;
      }>;
      resultOrder: string[];
    } | null;
  }>;
};

type SmokeResult = {
  tableId: string;
  raceId: string;
  raceEntryId: string;
  commandId: string;
  sawBetPlaced: boolean;
  sawWalletBet: boolean;
  sawRaceStarted: boolean;
  sawRaceSettled: boolean;
  sawPayoutOrSettlement: boolean;
};

const gameServerUrl =
  process.env.GAME_SERVER_SMOKE_URL ?? 'http://localhost:4000';
const tableId = process.env.RACING_SMOKE_TABLE_ID ?? 'main';
const runId = Date.now();
const userId = `racing-cycle-smoke-${runId}`;
const email = `${userId}@example.com`;
const commandId = `racing-cycle-bet-${runId}`;

async function main() {
  await cleanup();

  try {
    await seedSmokeUser();
    const table = await waitForBettingTable();
    const entry = table.race.entries[0];

    if (!entry) {
      throw new Error('Racing smoke table has no race entries.');
    }

    const result = await runSocketCycleSmoke({
      tableId: table.tableId,
      raceId: table.race.raceId,
      raceEntryId: entry.raceEntryId,
    });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await cleanup();
    await pool.end();
  }
}

async function seedSmokeUser() {
  await db.insert(authUsers).values({
    id: userId,
    name: 'Racing Cycle Smoke',
    email,
  });
  await ensureUserGameAccount({ userId, displayName: 'Racing Cycle Smoke' });
  await applyWalletMutation({
    userId,
    category: 'REWARD',
    type: 'DAILY_REWARD',
    delta: 10_000n,
    referenceType: 'racing_cycle_smoke',
    referenceId: userId,
    idempotencyKey: `racing:cycle-smoke:fund:${userId}`,
    memo: 'Racing cycle smoke funding',
  });
}

async function cleanup() {
  const client = await pool.connect();

  try {
    await client.query('begin');
    await client.query(
      `
        delete from racing_actions
        where user_id = $1
      `,
      [userId],
    );
    await client.query(
      `
        delete from racing_bet_selections
        where bet_id in (
          select id from racing_bets where user_id = $1
        )
      `,
      [userId],
    );
    await client.query('delete from racing_bets where user_id = $1', [userId]);
    await client.query('delete from point_ledgers where user_id = $1', [
      userId,
    ]);
    await client.query('delete from wallets where user_id = $1', [userId]);
    await client.query('delete from user_profiles where user_id = $1', [
      userId,
    ]);
    await client.query('delete from "user" where id = $1', [userId]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function waitForBettingTable() {
  const deadline = Date.now() + 180_000;

  while (Date.now() < deadline) {
    const response = await fetch(`${gameServerUrl}/racing/tables`);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch racing tables: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as RacingTableResponse;
    const table = data.tables.find(
      (candidate) =>
        candidate.tableId === tableId &&
        candidate.phase === 'BETTING' &&
        candidate.race?.entries.length,
    );

    if (table?.race) {
      return {
        ...table,
        race: table.race,
      };
    }

    await delay(2_000);
  }

  throw new Error('Racing smoke table did not enter BETTING phase in time.');
}

async function runSocketCycleSmoke(input: {
  tableId: string;
  raceId: string;
  raceEntryId: string;
}): Promise<SmokeResult> {
  const socket = io(`${gameServerUrl}/racing`, {
    transports: ['websocket'],
    auth: { userId, nickname: 'Racing Cycle Smoke', role: 'USER' },
    timeout: 5_000,
  });

  return await new Promise((resolve, reject) => {
    const result: SmokeResult = {
      ...input,
      commandId,
      sawBetPlaced: false,
      sawWalletBet: false,
      sawRaceStarted: false,
      sawRaceSettled: false,
      sawPayoutOrSettlement: false,
    };
    let sentBet = false;
    const timeout = setTimeout(() => {
      socket.close();
      reject(
        new Error(`Racing cycle smoke timed out: ${JSON.stringify(result)}`),
      );
    }, 360_000);

    function completeIfReady() {
      if (
        result.sawBetPlaced &&
        result.sawWalletBet &&
        result.sawRaceStarted &&
        result.sawRaceSettled &&
        result.sawPayoutOrSettlement
      ) {
        clearTimeout(timeout);
        socket.close();
        resolve(result);
      }
    }

    socket.on('connect', () => {
      socket.emit('table:join', { tableId: input.tableId });
    });

    socket.on('table:state', (state) => {
      if (
        !sentBet &&
        state?.phase === 'BETTING' &&
        state?.race?.raceId === input.raceId
      ) {
        sentBet = true;
        socket.emit('bet:place', {
          commandId,
          tableId: input.tableId,
          raceId: input.raceId,
          betType: 'WIN',
          amount: '100',
          raceEntryIds: [input.raceEntryId],
        });
      }

      if (state?.race?.raceId === input.raceId && state?.phase === 'SETTLED') {
        result.sawRaceSettled = true;
        result.sawPayoutOrSettlement = true;
        completeIfReady();
      }
    });

    socket.on('table:event', (event) => {
      if (event?.raceId && event.raceId !== input.raceId) {
        return;
      }

      if (event?.type === 'BET_PLACED' && event?.actorUserId === userId) {
        result.sawBetPlaced = true;
      }

      if (event?.type === 'RACE_STARTED') {
        result.sawRaceStarted = true;
      }

      if (event?.type === 'RACE_SETTLED') {
        result.sawRaceSettled = true;
        result.sawPayoutOrSettlement = true;
      }

      completeIfReady();
    });

    socket.on('wallet:updated', (payload) => {
      if (payload?.reason === 'BET_PLACED' && payload?.delta === '-100') {
        result.sawWalletBet = true;
      }

      if (payload?.reason === 'PAYOUT') {
        result.sawPayoutOrSettlement = true;
      }

      completeIfReady();
    });

    socket.on('error', (payload) => {
      clearTimeout(timeout);
      socket.close();
      reject(new Error(`Racing socket error: ${JSON.stringify(payload)}`));
    });

    socket.on('connect_error', (error) => {
      clearTimeout(timeout);
      socket.close();
      reject(error);
    });
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void main();
