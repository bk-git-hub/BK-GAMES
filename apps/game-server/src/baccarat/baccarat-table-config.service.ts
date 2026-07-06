import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import {
  dealBaccaratRound,
  type BaccaratCard,
} from './baccarat-engine.port';
import {
  BaccaratTableError,
  type BaccaratConfigureTableInput,
  type BaccaratRuntimeBetSnapshot,
  type BaccaratRuntimeRevealSnapshot,
  type BaccaratRuntimeRoundSnapshot,
  type BaccaratTableConfig,
} from './baccarat-table.service';
import type {
  BaccaratBetType,
  BaccaratRevealSlot,
  BaccaratRoundOutcome,
  BaccaratRoundResultView,
  BaccaratShoeSnapshot,
  BaccaratTableStatus,
} from '@bk-games/shared';

const dbPackageName: string = '@bk-games/db';
const mainBaccaratTableCode = 'main';

@Injectable()
export class BaccaratTableConfigService {
  async getRuntimeSnapshot(tableId: string): Promise<BaccaratConfigureTableInput> {
    const normalizedTableId = normalizeTableId(tableId);
    const db = (await import(dbPackageName)) as BaccaratDbModule;

    if (normalizedTableId === mainBaccaratTableCode) {
      await db.ensureMainBaccaratSeed();
    }

    const table = await getBaccaratTableByCode(db.pool, normalizedTableId);

    if (!table) {
      throw new BaccaratTableError(
        'TABLE_NOT_FOUND',
        `Baccarat table ${normalizedTableId} was not found.`,
      );
    }

    const active = await ensureActiveBaccaratRound(db.pool, table);
    const [reveals, bets, recentRounds] = await Promise.all([
      listRoundReveals(db.pool, active.round.roundId),
      listRoundBets(db.pool, active.round.roundId),
      listRecentSettledRounds(db.pool, table.tableId, table.resultHistoryLimit),
    ]);

    return {
      tableId: table.tableCode,
      config: toTableConfig(table),
      shoe: active.shoe,
      round: active.round,
      reveals,
      bets,
      recentRounds,
    };
  }

  async dealRound(input: {
    tableId: string;
    roundId: string;
  }): Promise<{
    round: BaccaratRuntimeRoundSnapshot;
    shoe: BaccaratShoeSnapshot;
    reveals: BaccaratRuntimeRevealSnapshot[];
  }> {
    const db = (await import(dbPackageName)) as BaccaratDbModule;

    return dealBaccaratRoundInDb(db.pool, input);
  }

  async markRevealActive(input: {
    roundId: string;
    revealId: string;
    squeezerUserId: string | null;
    startedAt: string;
    endsAt: string;
  }) {
    const db = (await import(dbPackageName)) as BaccaratDbModule;

    await db.pool.query('begin');

    try {
      const result = await db.pool.query<{ revealId: string }>(
        `
          update baccarat_reveals
          set
            status = 'ACTIVE',
            squeezer_user_id = $3,
            progress = 0,
            started_at = $4,
            ends_at = $5,
            updated_at = now()
          where id = $1 and round_id = $2 and status = 'PENDING'
          returning id as "revealId"
        `,
        [
          input.revealId,
          input.roundId,
          input.squeezerUserId,
          input.startedAt,
          input.endsAt,
        ],
      );

      if (!result.rows[0]) {
        throw new BaccaratTableError(
          'REVEAL_NOT_ACTIVE',
          `Baccarat reveal ${input.revealId} cannot be activated.`,
        );
      }

      await db.pool.query(
        `
          update baccarat_rounds
          set status = 'SQUEEZE', updated_at = now()
          where id = $1 and status in ('DEALING', 'SQUEEZE')
        `,
        [input.roundId],
      );
      await db.pool.query('commit');
    } catch (error) {
      await db.pool.query('rollback');
      throw error;
    }
  }

  async markRevealProgress(input: {
    roundId: string;
    revealId: string;
    squeezerUserId: string;
    progress: number;
  }) {
    const db = (await import(dbPackageName)) as BaccaratDbModule;

    const result = await db.pool.query<{ revealId: string }>(
      `
        update baccarat_reveals
        set progress = $4, updated_at = now()
        where id = $1
          and round_id = $2
          and squeezer_user_id = $3
          and status = 'ACTIVE'
        returning id as "revealId"
      `,
      [input.revealId, input.roundId, input.squeezerUserId, input.progress],
    );

    if (!result.rows[0]) {
      throw new BaccaratTableError(
        'REVEAL_NOT_ACTIVE',
        `Baccarat reveal ${input.revealId} cannot record progress.`,
      );
    }
  }

  async markRevealCompleted(input: {
    roundId: string;
    revealId: string;
    revealedBy: string;
    revealedAt: string;
    card: BaccaratCard;
  }) {
    const db = (await import(dbPackageName)) as BaccaratDbModule;

    await db.pool.query('begin');

    try {
      const result = await db.pool.query<{ revealId: string }>(
        `
          update baccarat_reveals
          set
            status = 'REVEALED',
            progress = 100,
            revealed_at = $3,
            revealed_by = $4,
            card_snapshot = $5::jsonb,
            updated_at = now()
          where id = $1 and round_id = $2 and status = 'ACTIVE'
          returning id as "revealId"
        `,
        [
          input.revealId,
          input.roundId,
          input.revealedAt,
          input.revealedBy,
          JSON.stringify(input.card),
        ],
      );

      if (!result.rows[0]) {
        throw new BaccaratTableError(
          'REVEAL_NOT_ACTIVE',
          `Baccarat reveal ${input.revealId} cannot be completed.`,
        );
      }

      const pending = await db.pool.query<{ count: string }>(
        `
          select count(*) as count
          from baccarat_reveals
          where round_id = $1 and status in ('PENDING', 'ACTIVE')
        `,
        [input.roundId],
      );
      const pendingCount = Number(pending.rows[0]?.count ?? 0);

      if (pendingCount === 0) {
        await db.pool.query(
          `
            update baccarat_rounds
            set status = 'SETTLING', updated_at = now()
            where id = $1 and status in ('DEALING', 'SQUEEZE')
          `,
          [input.roundId],
        );
      }

      await db.pool.query('commit');
    } catch (error) {
      await db.pool.query('rollback');
      throw error;
    }
  }

  async listRecentSettledRounds(tableId: string) {
    const normalizedTableId = normalizeTableId(tableId);
    const db = (await import(dbPackageName)) as BaccaratDbModule;
    const table = await getBaccaratTableByCode(db.pool, normalizedTableId);

    if (!table) {
      return [];
    }

    return listRecentSettledRounds(db.pool, table.tableId, table.resultHistoryLimit);
  }

  async getNextRoundSnapshot(
    tableId: string,
  ): Promise<BaccaratConfigureTableInput> {
    return this.getRuntimeSnapshot(tableId);
  }
}

type BaccaratDbModule = {
  ensureMainBaccaratSeed(): Promise<unknown>;
  pool: QueryPool;
};

type QueryPool = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type BaccaratTableRow = {
  tableId: string;
  tableCode: string;
  status: string;
  minBet: bigint | string;
  maxMainBet: bigint | string;
  maxTotalBetPerUser: bigint | string;
  bettingTimeoutSeconds: number;
  squeezeTimeoutSeconds: number;
  roundEndDelaySeconds: number;
  deckCount: number;
  shoePenetrationPercent: number;
  minimumCardsBeforeRound: number;
  resultHistoryLimit: number;
  tiePayoutNumerator: number;
  tiePayoutDenominator: number;
  bankerCommissionBps: number;
  rules: Record<string, unknown>;
};

type BaccaratShoeRow = {
  shoeId: string;
  shoeNo: number;
  status: string;
  deckCount: number;
  cardsTotal: number;
  cardsDealt: number;
  cardsRemaining: number;
  cutCardPosition: number;
  encryptedState: unknown;
};

type BaccaratRoundRow = {
  roundId: string;
  shoeId: string;
  roundNo: number;
  status: string;
  bettingOpensAt: Date | string | null;
  bettingClosesAt: Date | string | null;
  playerCards: unknown;
  bankerCards: unknown;
  playerTotal: number | null;
  bankerTotal: number | null;
  outcome: string | null;
  isNatural: boolean;
  totalCards: number | null;
};

type BaccaratRevealRow = {
  revealId: string;
  slot: string;
  status: string;
  sequence: number;
  squeezerUserId: string | null;
  progress: number;
  startedAt: Date | string | null;
  endsAt: Date | string | null;
  revealedAt: Date | string | null;
  cardSnapshot: unknown;
};

type BaccaratBetRow = {
  betId: string;
  userId: string;
  nickname: string | null;
  betType: string;
  amount: bigint | string;
  status: string;
  payoutAmount: bigint | string | null;
  netAmount: bigint | string | null;
  commandId: string;
  createdAt: Date | string;
};

async function getBaccaratTableByCode(
  pool: QueryPool,
  tableCode: string,
): Promise<BaccaratTableRow | null> {
  const { rows } = await pool.query<BaccaratTableRow>(
    `
      select
        id as "tableId",
        code as "tableCode",
        status,
        min_bet as "minBet",
        max_main_bet as "maxMainBet",
        max_total_bet_per_user as "maxTotalBetPerUser",
        betting_timeout_seconds as "bettingTimeoutSeconds",
        squeeze_timeout_seconds as "squeezeTimeoutSeconds",
        round_end_delay_seconds as "roundEndDelaySeconds",
        deck_count as "deckCount",
        shoe_penetration_percent as "shoePenetrationPercent",
        minimum_cards_before_round as "minimumCardsBeforeRound",
        result_history_limit as "resultHistoryLimit",
        tie_payout_numerator as "tiePayoutNumerator",
        tie_payout_denominator as "tiePayoutDenominator",
        banker_commission_bps as "bankerCommissionBps",
        rules
      from baccarat_tables
      where code = $1
      limit 1
    `,
    [tableCode],
  );

  return rows[0] ?? null;
}

async function ensureActiveBaccaratRound(
  pool: QueryPool,
  table: BaccaratTableRow,
) {
  await pool.query('begin');

  try {
    const existingRound = await findCurrentRoundForUpdate(pool, table.tableId);

    if (existingRound) {
      const currentShoe = await findShoeByIdForUpdate(pool, existingRound.shoeId);

      if (!currentShoe) {
        throw new BaccaratTableError(
          'SHOE_NOT_READY',
          `Baccarat shoe ${existingRound.shoeId} was not found.`,
        );
      }

      await pool.query('commit');
      return {
        shoe: toShoeSnapshot(currentShoe, table),
        round: toRuntimeRoundSnapshot(existingRound),
      };
    }

    let shoe = await findActiveShoeForUpdate(pool, table);

    if (!shoe || shouldStartNewShoe(table, shoe)) {
      if (shoe) {
        await pool.query(
          `
            update baccarat_shoes
            set status = 'COMPLETED', ended_at = now(), updated_at = now()
            where id = $1
          `,
          [shoe.shoeId],
        );
      }

      shoe = await createShoe(pool, table);
    }

    const round = await createWaitingRound(pool, table, shoe);

    await pool.query('commit');
    return {
      shoe: toShoeSnapshot(shoe, table),
      round: toRuntimeRoundSnapshot(round),
    };
  } catch (error) {
    await pool.query('rollback');
    throw error;
  }
}

async function findShoeByIdForUpdate(
  pool: QueryPool,
  shoeId: string,
): Promise<BaccaratShoeRow | null> {
  const { rows } = await pool.query<BaccaratShoeRow>(
    `
      select
        id as "shoeId",
        shoe_no as "shoeNo",
        status,
        deck_count as "deckCount",
        cards_total as "cardsTotal",
        cards_dealt as "cardsDealt",
        cards_remaining as "cardsRemaining",
        cut_card_position as "cutCardPosition",
        encrypted_state as "encryptedState"
      from baccarat_shoes
      where id = $1
      limit 1
      for update
    `,
    [shoeId],
  );

  return rows[0] ?? null;
}

async function dealBaccaratRoundInDb(
  pool: QueryPool,
  input: { tableId: string; roundId: string },
) {
  await pool.query('begin');

  try {
    const context = await lockRoundDealContext(pool, input);

    if (!context) {
      throw new BaccaratTableError(
        'ROUND_NOT_FOUND',
        `Baccarat round ${input.roundId} was not found.`,
      );
    }

    const { table, round, shoe } = context;

    if (round.status !== 'WAITING_BETS') {
      const reveals = await listRoundReveals(pool, round.roundId);

      await pool.query('commit');
      return {
        round: toRuntimeRoundSnapshot(round),
        shoe: toShoeSnapshot(shoe, table),
        reveals,
      };
    }

    const shoeState = parseShoeState(shoe.encryptedState);
    const cards = shoeState.cards.slice(Number(shoe.cardsDealt));
    const result = dealBaccaratRound(cards);
    const consumedCards = result.consumedCards;
    const nextCardsDealt = Number(shoe.cardsDealt) + consumedCards;
    const playerCards = result.player.cards;
    const bankerCards = result.banker.cards;
    const now = new Date();

    await pool.query(
      `
        update baccarat_shoes
        set
          cards_dealt = $2,
          cards_remaining = cards_total - $2,
          state_version = state_version + 1,
          updated_at = $3
        where id = $1
      `,
      [shoe.shoeId, nextCardsDealt, now],
    );

    const { rows } = await pool.query<BaccaratRoundRow>(
      `
        update baccarat_rounds
        set
          status = 'DEALING',
          player_cards = $2::jsonb,
          banker_cards = $3::jsonb,
          player_total = $4,
          banker_total = $5,
          outcome = $6,
          is_natural = $7,
          total_cards = $8,
          dealt_at = $9,
          started_at = coalesce(started_at, $9),
          updated_at = $9
        where id = $1
        returning
          id as "roundId",
          shoe_id as "shoeId",
          round_no as "roundNo",
          status,
          betting_opens_at as "bettingOpensAt",
          betting_closes_at as "bettingClosesAt",
          player_cards as "playerCards",
          banker_cards as "bankerCards",
          player_total as "playerTotal",
          banker_total as "bankerTotal",
          outcome,
          is_natural as "isNatural",
          total_cards as "totalCards"
      `,
      [
        round.roundId,
        JSON.stringify(playerCards),
        JSON.stringify(bankerCards),
        result.player.total,
        result.banker.total,
        result.outcome,
        result.isNatural,
        result.totalCards,
        now,
      ],
    );
    const dealtRound = rows[0];

    if (!dealtRound) {
      throw new BaccaratTableError(
        'UNKNOWN_ERROR',
        `Failed to update Baccarat round ${round.roundId}.`,
      );
    }

    await insertRevealSlots(pool, table.tableId, round.roundId, result);
    await insertSystemAction(pool, round.roundId, 'DEAL', {
      consumedCards,
      outcome: result.outcome,
      playerDrew: result.playerDrew,
      bankerDrew: result.bankerDrew,
    });

    const [updatedShoe] = await findShoeById(pool, shoe.shoeId);
    const reveals = await listRoundReveals(pool, round.roundId);

    await pool.query('commit');
    return {
      round: toRuntimeRoundSnapshot(dealtRound),
      shoe: toShoeSnapshot(updatedShoe ?? shoe, table),
      reveals,
    };
  } catch (error) {
    await pool.query('rollback');
    throw error;
  }
}

async function lockRoundDealContext(
  pool: QueryPool,
  input: { tableId: string; roundId: string },
) {
  const { rows } = await pool.query<
    BaccaratTableRow & BaccaratShoeRow & BaccaratRoundRow
  >(
    `
      select
        bt.id as "tableId",
        bt.code as "tableCode",
        bt.status,
        bt.min_bet as "minBet",
        bt.max_main_bet as "maxMainBet",
        bt.max_total_bet_per_user as "maxTotalBetPerUser",
        bt.betting_timeout_seconds as "bettingTimeoutSeconds",
        bt.squeeze_timeout_seconds as "squeezeTimeoutSeconds",
        bt.round_end_delay_seconds as "roundEndDelaySeconds",
        bt.deck_count as "deckCount",
        bt.shoe_penetration_percent as "shoePenetrationPercent",
        bt.minimum_cards_before_round as "minimumCardsBeforeRound",
        bt.result_history_limit as "resultHistoryLimit",
        bt.tie_payout_numerator as "tiePayoutNumerator",
        bt.tie_payout_denominator as "tiePayoutDenominator",
        bt.banker_commission_bps as "bankerCommissionBps",
        bt.rules,
        bs.id as "shoeId",
        bs.shoe_no as "shoeNo",
        bs.status as "shoeStatus",
        bs.deck_count as "shoeDeckCount",
        bs.cards_total as "cardsTotal",
        bs.cards_dealt as "cardsDealt",
        bs.cards_remaining as "cardsRemaining",
        bs.cut_card_position as "cutCardPosition",
        bs.encrypted_state as "encryptedState",
        br.id as "roundId",
        br.round_no as "roundNo",
        br.status as "roundStatus",
        br.betting_opens_at as "bettingOpensAt",
        br.betting_closes_at as "bettingClosesAt",
        br.player_cards as "playerCards",
        br.banker_cards as "bankerCards",
        br.player_total as "playerTotal",
        br.banker_total as "bankerTotal",
        br.outcome,
        br.is_natural as "isNatural",
        br.total_cards as "totalCards"
      from baccarat_rounds br
      inner join baccarat_tables bt on bt.id = br.table_id
      inner join baccarat_shoes bs on bs.id = br.shoe_id
      where bt.code = $1 and br.id = $2
      for update of br, bs, bt
    `,
    [input.tableId, input.roundId],
  );
  const row = rows[0] as
    | (BaccaratTableRow &
        BaccaratShoeRow &
        BaccaratRoundRow & {
          shoeStatus: string;
          shoeDeckCount: number;
          roundStatus: string;
        })
    | undefined;

  if (!row) {
    return null;
  }

  return {
    table: row,
    shoe: {
      shoeId: row.shoeId,
      shoeNo: row.shoeNo,
      status: row.shoeStatus,
      deckCount: row.shoeDeckCount,
      cardsTotal: row.cardsTotal,
      cardsDealt: row.cardsDealt,
      cardsRemaining: row.cardsRemaining,
      cutCardPosition: row.cutCardPosition,
      encryptedState: row.encryptedState,
    } satisfies BaccaratShoeRow,
    round: {
      roundId: row.roundId,
      shoeId: row.shoeId,
      roundNo: row.roundNo,
      status: row.roundStatus,
      bettingOpensAt: row.bettingOpensAt,
      bettingClosesAt: row.bettingClosesAt,
      playerCards: row.playerCards,
      bankerCards: row.bankerCards,
      playerTotal: row.playerTotal,
      bankerTotal: row.bankerTotal,
      outcome: row.outcome,
      isNatural: row.isNatural,
      totalCards: row.totalCards,
    } satisfies BaccaratRoundRow,
  };
}

async function findActiveShoeForUpdate(
  pool: QueryPool,
  table: BaccaratTableRow,
): Promise<BaccaratShoeRow | null> {
  const { rows } = await pool.query<BaccaratShoeRow>(
    `
      select
        id as "shoeId",
        shoe_no as "shoeNo",
        status,
        deck_count as "deckCount",
        cards_total as "cardsTotal",
        cards_dealt as "cardsDealt",
        cards_remaining as "cardsRemaining",
        cut_card_position as "cutCardPosition",
        encrypted_state as "encryptedState"
      from baccarat_shoes
      where table_id = $1 and status = 'ACTIVE'
      order by shoe_no desc
      limit 1
      for update
    `,
    [table.tableId],
  );

  return rows[0] ?? null;
}

async function findShoeById(pool: QueryPool, shoeId: string) {
  const { rows } = await pool.query<BaccaratShoeRow>(
    `
      select
        id as "shoeId",
        shoe_no as "shoeNo",
        status,
        deck_count as "deckCount",
        cards_total as "cardsTotal",
        cards_dealt as "cardsDealt",
        cards_remaining as "cardsRemaining",
        cut_card_position as "cutCardPosition",
        encrypted_state as "encryptedState"
      from baccarat_shoes
      where id = $1
      limit 1
    `,
    [shoeId],
  );

  return rows;
}

async function createShoe(
  pool: QueryPool,
  table: BaccaratTableRow,
): Promise<BaccaratShoeRow> {
  const deck = shuffleDeck(createDeck(table.deckCount));
  const cardsTotal = deck.length;
  const seed = randomBytes(32).toString('hex');
  const serverSeedHash = createHash('sha256').update(seed).digest('hex');
  const cutCardPosition = Math.max(
    1,
    Math.min(
      cardsTotal,
      Math.floor((cardsTotal * table.shoePenetrationPercent) / 100),
    ),
  );
  const { rows } = await pool.query<BaccaratShoeRow>(
    `
      insert into baccarat_shoes (
        table_id,
        shoe_no,
        status,
        deck_count,
        cards_total,
        cards_dealt,
        cards_remaining,
        cut_card_position,
        server_seed_hash,
        encrypted_state,
        started_at
      )
      values (
        $1,
        coalesce((select max(shoe_no) from baccarat_shoes where table_id = $1), 0) + 1,
        'ACTIVE',
        $2,
        $3,
        0,
        $3,
        $4,
        $5,
        $6::jsonb,
        now()
      )
      returning
        id as "shoeId",
        shoe_no as "shoeNo",
        status,
        deck_count as "deckCount",
        cards_total as "cardsTotal",
        cards_dealt as "cardsDealt",
        cards_remaining as "cardsRemaining",
        cut_card_position as "cutCardPosition",
        encrypted_state as "encryptedState"
    `,
    [
      table.tableId,
      table.deckCount,
      cardsTotal,
      cutCardPosition,
      serverSeedHash,
      JSON.stringify({
        version: 1,
        seedHash: serverSeedHash,
        cards: deck,
      }),
    ],
  );

  const shoe = rows[0];

  if (!shoe) {
    throw new BaccaratTableError('UNKNOWN_ERROR', 'Failed to create Baccarat shoe.');
  }

  return shoe;
}

async function findCurrentRoundForUpdate(
  pool: QueryPool,
  tableId: string,
): Promise<BaccaratRoundRow | null> {
  const { rows } = await pool.query<BaccaratRoundRow>(
    `
      select
        id as "roundId",
        shoe_id as "shoeId",
        round_no as "roundNo",
        status,
        betting_opens_at as "bettingOpensAt",
        betting_closes_at as "bettingClosesAt",
        player_cards as "playerCards",
        banker_cards as "bankerCards",
        player_total as "playerTotal",
        banker_total as "bankerTotal",
        outcome,
        is_natural as "isNatural",
        total_cards as "totalCards"
      from baccarat_rounds
      where table_id = $1
        and status in ('WAITING_BETS', 'DEALING', 'SQUEEZE', 'SETTLING')
      order by round_no desc
      limit 1
      for update
    `,
    [tableId],
  );

  return rows[0] ?? null;
}

async function createWaitingRound(
  pool: QueryPool,
  table: BaccaratTableRow,
  shoe: BaccaratShoeRow,
): Promise<BaccaratRoundRow> {
  const now = new Date();
  const bettingClosesAt = new Date(
    now.getTime() + table.bettingTimeoutSeconds * 1000,
  );
  const { rows } = await pool.query<BaccaratRoundRow>(
    `
      insert into baccarat_rounds (
        table_id,
        shoe_id,
        round_index_in_shoe,
        round_no,
        status,
        rule_snapshot,
        betting_opens_at,
        betting_closes_at
      )
      values (
        $1,
        $2,
        coalesce((select max(round_index_in_shoe) from baccarat_rounds where shoe_id = $2), 0) + 1,
        coalesce((select max(round_no) from baccarat_rounds where table_id = $1), 0) + 1,
        'WAITING_BETS',
        $3::jsonb,
        $4,
        $5
      )
      returning
        id as "roundId",
        shoe_id as "shoeId",
        round_no as "roundNo",
        status,
        betting_opens_at as "bettingOpensAt",
        betting_closes_at as "bettingClosesAt",
        player_cards as "playerCards",
        banker_cards as "bankerCards",
        player_total as "playerTotal",
        banker_total as "bankerTotal",
        outcome,
        is_natural as "isNatural",
        total_cards as "totalCards"
    `,
    [
      table.tableId,
      shoe.shoeId,
      JSON.stringify(toRuleSnapshot(table)),
      now,
      bettingClosesAt,
    ],
  );
  const round = rows[0];

  if (!round) {
    throw new BaccaratTableError('UNKNOWN_ERROR', 'Failed to create Baccarat round.');
  }

  return round;
}

async function listRoundReveals(
  pool: QueryPool,
  roundId: string,
): Promise<BaccaratRuntimeRevealSnapshot[]> {
  const { rows } = await pool.query<BaccaratRevealRow>(
    `
      select
        id as "revealId",
        slot,
        status,
        sequence,
        squeezer_user_id as "squeezerUserId",
        progress,
        started_at as "startedAt",
        ends_at as "endsAt",
        revealed_at as "revealedAt",
        card_snapshot as "cardSnapshot"
      from baccarat_reveals
      where round_id = $1
      order by sequence asc
    `,
    [roundId],
  );

  return rows.map(toRuntimeRevealSnapshot);
}

async function listRoundBets(
  pool: QueryPool,
  roundId: string,
): Promise<BaccaratRuntimeBetSnapshot[]> {
  const { rows } = await pool.query<BaccaratBetRow>(
    `
      select
        bb.id as "betId",
        bb.user_id as "userId",
        au.name as "nickname",
        bb.bet_type as "betType",
        bb.amount,
        bb.status,
        bb.payout_amount as "payoutAmount",
        bb.net_amount as "netAmount",
        bb.command_id as "commandId",
        bb.created_at as "createdAt"
      from baccarat_bets bb
      left join "user" au on au.id = bb.user_id
      where bb.round_id = $1
      order by bb.created_at asc, bb.id asc
    `,
    [roundId],
  );

  return rows.map(toRuntimeBetSnapshot);
}

async function listRecentSettledRounds(
  pool: QueryPool,
  tableId: string,
  limit: number,
): Promise<BaccaratRoundResultView[]> {
  const { rows } = await pool.query<{
    roundId: string;
    roundNo: number;
    outcome: string;
    playerTotal: number;
    bankerTotal: number;
    isNatural: boolean;
    totalCards: number;
  }>(
    `
      select
        id as "roundId",
        round_no as "roundNo",
        outcome,
        player_total as "playerTotal",
        banker_total as "bankerTotal",
        is_natural as "isNatural",
        total_cards as "totalCards"
      from baccarat_rounds
      where table_id = $1
        and status = 'SETTLED'
        and outcome is not null
        and player_total is not null
        and banker_total is not null
        and total_cards is not null
      order by round_no desc
      limit $2
    `,
    [tableId, limit],
  );

  return rows.reverse().map((round) => ({
    roundId: round.roundId,
    roundNo: Number(round.roundNo),
    outcome: parseRoundOutcome(round.outcome),
    playerTotal: Number(round.playerTotal),
    bankerTotal: Number(round.bankerTotal),
    isNatural: Boolean(round.isNatural),
    totalCards: Number(round.totalCards),
  }));
}

async function insertRevealSlots(
  pool: QueryPool,
  tableId: string,
  roundId: string,
  result: ReturnType<typeof dealBaccaratRound>,
) {
  const slots = buildRevealSlots(result);

  for (const [index, slot] of slots.entries()) {
    await pool.query(
      `
        insert into baccarat_reveals (
          round_id,
          table_id,
          slot,
          status,
          sequence
        )
        values ($1, $2, $3, 'PENDING', $4)
        on conflict (round_id, slot) do nothing
      `,
      [roundId, tableId, slot, index + 1],
    );
  }
}

async function insertSystemAction(
  pool: QueryPool,
  roundId: string,
  actionType: string,
  payload: Record<string, unknown>,
) {
  await pool.query(
    `
      insert into baccarat_actions (
        round_id,
        actor_type,
        action_type,
        action_sequence,
        amount,
        payload
      )
      values (
        $1,
        'SYSTEM',
        $2,
        coalesce((select max(action_sequence) from baccarat_actions where round_id = $1), 0) + 1,
        0,
        $3::jsonb
      )
      on conflict do nothing
    `,
    [roundId, actionType, JSON.stringify(payload)],
  );
}

function toTableConfig(table: BaccaratTableRow): BaccaratTableConfig {
  return {
    status: parseTableStatus(table.status),
    minBet: toBigInt(table.minBet),
    maxMainBet: toBigInt(table.maxMainBet),
    maxTotalBetPerUser: toBigInt(table.maxTotalBetPerUser),
    bettingTimeoutSeconds: Number(table.bettingTimeoutSeconds),
    squeezeTimeoutSeconds: Number(table.squeezeTimeoutSeconds),
    roundEndDelaySeconds: Number(table.roundEndDelaySeconds),
    deckCount: Number(table.deckCount),
    shoePenetrationPercent: Number(table.shoePenetrationPercent),
    minimumCardsBeforeRound: Number(table.minimumCardsBeforeRound),
    resultHistoryLimit: Number(table.resultHistoryLimit),
    tiePayoutNumerator: Number(table.tiePayoutNumerator),
    tiePayoutDenominator: Number(table.tiePayoutDenominator),
    bankerCommissionBps: Number(table.bankerCommissionBps),
    betTypes: readBetTypes(table.rules),
  };
}

function toRuntimeRoundSnapshot(
  row: BaccaratRoundRow,
): BaccaratRuntimeRoundSnapshot {
  return {
    roundId: row.roundId,
    shoeId: row.shoeId,
    roundNo: Number(row.roundNo),
    status: parseRoundStatus(row.status),
    bettingOpensAt: toIsoStringOrNull(row.bettingOpensAt),
    bettingClosesAt: toIsoStringOrNull(row.bettingClosesAt),
    playerCards: parseCards(row.playerCards),
    bankerCards: parseCards(row.bankerCards),
    playerTotal: nullableNumber(row.playerTotal),
    bankerTotal: nullableNumber(row.bankerTotal),
    outcome: row.outcome ? parseRoundOutcome(row.outcome) : null,
    isNatural: Boolean(row.isNatural),
    totalCards: nullableNumber(row.totalCards),
  };
}

function toRuntimeRevealSnapshot(
  row: BaccaratRevealRow,
): BaccaratRuntimeRevealSnapshot {
  return {
    revealId: row.revealId,
    slot: parseRevealSlot(row.slot),
    status: parseRevealStatus(row.status),
    sequence: Number(row.sequence),
    squeezerUserId: row.squeezerUserId,
    progress: Number(row.progress),
    startedAt: toIsoStringOrNull(row.startedAt),
    endsAt: toIsoStringOrNull(row.endsAt),
    revealedAt: toIsoStringOrNull(row.revealedAt),
    card: row.cardSnapshot ? parseCard(row.cardSnapshot) : null,
  };
}

function toRuntimeBetSnapshot(row: BaccaratBetRow): BaccaratRuntimeBetSnapshot {
  return {
    betId: row.betId,
    userId: row.userId,
    nickname: row.nickname,
    betType: parseBetType(row.betType),
    amount: toBigInt(row.amount),
    status: parseBetStatus(row.status),
    payoutAmount: row.payoutAmount === null ? null : toBigInt(row.payoutAmount),
    netAmount: row.netAmount === null ? null : toBigInt(row.netAmount),
    commandId: row.commandId,
    createdAt: toIsoString(row.createdAt),
  };
}

function toShoeSnapshot(
  shoe: BaccaratShoeRow,
  table: BaccaratTableRow,
): BaccaratShoeSnapshot {
  const cardsTotal = Number(shoe.cardsTotal);
  const cardsDealt = Number(shoe.cardsDealt);
  const cardsRemaining = Number(shoe.cardsRemaining);
  const cutCardPosition = Number(shoe.cutCardPosition);

  return {
    shoeId: shoe.shoeId,
    shoeNo: Number(shoe.shoeNo),
    deckCount: Number(shoe.deckCount),
    cardsDealt,
    cardsRemaining,
    penetrationPercent:
      cardsTotal > 0 ? Math.trunc((cardsDealt / cardsTotal) * 100) : 0,
    willShuffleAfterRound:
      cardsRemaining < table.minimumCardsBeforeRound ||
      cardsDealt >= cutCardPosition,
  };
}

function shouldStartNewShoe(table: BaccaratTableRow, shoe: BaccaratShoeRow) {
  return (
    Number(shoe.cardsRemaining) < table.minimumCardsBeforeRound ||
    Number(shoe.cardsDealt) >= Number(shoe.cutCardPosition) ||
    !shoe.encryptedState
  );
}

function toRuleSnapshot(table: BaccaratTableRow) {
  return {
    deckCount: Number(table.deckCount),
    shoePenetrationPercent: Number(table.shoePenetrationPercent),
    minimumCardsBeforeRound: Number(table.minimumCardsBeforeRound),
    tiePayout: {
      numerator: Number(table.tiePayoutNumerator),
      denominator: Number(table.tiePayoutDenominator),
    },
    bankerCommissionBps: Number(table.bankerCommissionBps),
    betTypes: readBetTypes(table.rules),
    roadmaps: {
      beadPlate: true,
      basicBigRoad: true,
    },
  };
}

function buildRevealSlots(
  result: ReturnType<typeof dealBaccaratRound>,
): BaccaratRevealSlot[] {
  return [
    'PLAYER_CARD_1',
    'BANKER_CARD_1',
    'PLAYER_CARD_2',
    'BANKER_CARD_2',
    ...(result.player.cards[2] ? (['PLAYER_CARD_3'] as const) : []),
    ...(result.banker.cards[2] ? (['BANKER_CARD_3'] as const) : []),
  ];
}

function createDeck(deckCount: number): BaccaratCard[] {
  const ranks = [
    'A',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '10',
    'J',
    'Q',
    'K',
  ] as const;
  const suits = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
  const deck: BaccaratCard[] = [];

  for (let deckIndex = 0; deckIndex < deckCount; deckIndex += 1) {
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ rank, suit });
      }
    }
  }

  return deck;
}

function shuffleDeck(cards: BaccaratCard[]) {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    const current = shuffled[index];
    const swap = shuffled[swapIndex];

    if (current && swap) {
      shuffled[index] = swap;
      shuffled[swapIndex] = current;
    }
  }

  return shuffled;
}

function parseShoeState(value: unknown): { cards: BaccaratCard[] } {
  const parsed = parseJson(value);
  const cards = Array.isArray(parsed.cards) ? parsed.cards.map(parseCard) : [];

  if (cards.length < 6) {
    throw new BaccaratTableError(
      'SHOE_NOT_READY',
      'Baccarat shoe does not have enough server-side cards.',
    );
  }

  return { cards };
}

function parseJson(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    return JSON.parse(value) as Record<string, unknown>;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function parseCards(value: unknown): BaccaratCard[] {
  if (Array.isArray(value)) {
    return value.map(parseCard);
  }

  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as unknown;

    return Array.isArray(parsed) ? parsed.map(parseCard) : [];
  }

  return [];
}

function parseCard(value: unknown): BaccaratCard {
  const card = value as Partial<BaccaratCard>;

  if (!card || !isRank(card.rank) || !isSuit(card.suit)) {
    throw new BaccaratTableError('SHOE_NOT_READY', 'Invalid Baccarat card state.');
  }

  return {
    rank: card.rank,
    suit: card.suit,
  };
}

function readBetTypes(rules: Record<string, unknown>): BaccaratBetType[] {
  const betTypes = Array.isArray(rules.betTypes) ? rules.betTypes : [];
  const normalized = betTypes.filter(isBetType);

  return normalized.length > 0 ? normalized : ['PLAYER', 'BANKER', 'TIE'];
}

function parseTableStatus(status: string): BaccaratTableStatus {
  if (status === 'OPEN' || status === 'MAINTENANCE' || status === 'CLOSED') {
    return status;
  }

  throw new BaccaratTableError(
    'TABLE_NOT_OPEN',
    `Unsupported Baccarat table status ${status}.`,
  );
}

function parseRoundStatus(status: string) {
  if (
    status === 'WAITING_BETS' ||
    status === 'DEALING' ||
    status === 'SQUEEZE' ||
    status === 'SETTLING' ||
    status === 'SETTLED' ||
    status === 'CANCELLED'
  ) {
    return status;
  }

  throw new BaccaratTableError(
    'ROUND_NOT_ACTIVE',
    `Unsupported Baccarat round status ${status}.`,
  );
}

function parseRoundOutcome(outcome: string): BaccaratRoundOutcome {
  if (outcome === 'PLAYER' || outcome === 'BANKER' || outcome === 'TIE') {
    return outcome;
  }

  throw new BaccaratTableError(
    'INVALID_SETTLEMENT',
    `Unsupported Baccarat outcome ${outcome}.`,
  );
}

function parseRevealSlot(slot: string): BaccaratRevealSlot {
  if (
    slot === 'PLAYER_CARD_1' ||
    slot === 'BANKER_CARD_1' ||
    slot === 'PLAYER_CARD_2' ||
    slot === 'BANKER_CARD_2' ||
    slot === 'PLAYER_CARD_3' ||
    slot === 'BANKER_CARD_3'
  ) {
    return slot;
  }

  throw new BaccaratTableError(
    'INVALID_REVEAL_ID',
    `Unsupported Baccarat reveal slot ${slot}.`,
  );
}

function parseRevealStatus(status: string) {
  if (
    status === 'PENDING' ||
    status === 'ACTIVE' ||
    status === 'REVEALED' ||
    status === 'SKIPPED'
  ) {
    return status;
  }

  throw new BaccaratTableError(
    'REVEAL_NOT_ACTIVE',
    `Unsupported Baccarat reveal status ${status}.`,
  );
}

function parseBetType(betType: string): BaccaratBetType {
  if (isBetType(betType)) {
    return betType;
  }

  throw new BaccaratTableError(
    'INVALID_BET_TYPE',
    `Unsupported Baccarat bet type ${betType}.`,
  );
}

function parseBetStatus(status: string) {
  if (status === 'PLACED' || status === 'SETTLED' || status === 'CANCELLED') {
    return status;
  }

  throw new BaccaratTableError(
    'BETTING_CLOSED',
    `Unsupported Baccarat bet status ${status}.`,
  );
}

function isBetType(value: unknown): value is BaccaratBetType {
  return value === 'PLAYER' || value === 'BANKER' || value === 'TIE';
}

function isRank(value: unknown): value is BaccaratCard['rank'] {
  return (
    value === 'A' ||
    value === '2' ||
    value === '3' ||
    value === '4' ||
    value === '5' ||
    value === '6' ||
    value === '7' ||
    value === '8' ||
    value === '9' ||
    value === '10' ||
    value === 'J' ||
    value === 'Q' ||
    value === 'K'
  );
}

function isSuit(value: unknown): value is BaccaratCard['suit'] {
  return (
    value === 'clubs' ||
    value === 'diamonds' ||
    value === 'hearts' ||
    value === 'spades'
  );
}

function normalizeTableId(tableId: string) {
  const normalized = tableId.trim();

  if (!normalized) {
    throw new BaccaratTableError('INVALID_TABLE_ID', 'tableId is required.');
  }

  return normalized;
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toIsoStringOrNull(value: Date | string | null) {
  return value ? toIsoString(value) : null;
}

function toBigInt(value: bigint | string | number) {
  return typeof value === 'bigint' ? value : BigInt(value);
}

function nullableNumber(value: number | null) {
  return value === null ? null : Number(value);
}
