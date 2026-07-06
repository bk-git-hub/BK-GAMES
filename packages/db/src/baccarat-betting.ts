import { and, eq, sql } from "drizzle-orm";

import { db } from "./client.js";
import {
  baccaratActions,
  baccaratBets,
  type JsonObject,
} from "./schema.js";
import {
  applyWalletMutationInTransaction,
  getActiveWalletForUpdate,
  type WalletMutationResult,
  type WalletMutationTransaction,
} from "./wallet-transactions.js";

export type BaccaratBetType = "PLAYER" | "BANKER" | "TIE";
export type BaccaratBetGroup = "MAIN";

const baccaratBetTypes = new Set<BaccaratBetType>([
  "PLAYER",
  "BANKER",
  "TIE",
]);
const zero = BigInt(0);

export type BaccaratBettingErrorCode =
  | "ROUND_NOT_FOUND"
  | "TABLE_NOT_OPEN"
  | "BETTING_CLOSED"
  | "INVALID_BET"
  | "BET_TOO_LOW"
  | "BET_TOO_HIGH"
  | "BET_ALREADY_PLACED"
  | "INSUFFICIENT_BALANCE"
  | "IDEMPOTENCY_CONFLICT";

export class BaccaratBettingError extends Error {
  readonly code: BaccaratBettingErrorCode;

  constructor(code: BaccaratBettingErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "BaccaratBettingError";
  }
}

export type PlaceBaccaratBetInput = {
  tableCode: string;
  roundId?: string | null;
  userId: string;
  amount: bigint;
  commandId: string;
  betType: BaccaratBetType;
};

export type PlaceBaccaratBetResult = {
  table: BaccaratTableSnapshot;
  round: BaccaratRoundSnapshot;
  bet: typeof baccaratBets.$inferSelect;
  walletMutation: WalletMutationResult;
};

export type BaccaratTableSnapshot = {
  id: string;
  code: string;
  status: "OPEN" | "MAINTENANCE" | "CLOSED";
  minBet: bigint;
  maxMainBet: bigint;
  maxTotalBetPerUser: bigint;
  tiePayoutNumerator: number;
  tiePayoutDenominator: number;
  bankerCommissionBps: number;
};

export type BaccaratRoundSnapshot = {
  id: string;
  tableId: string;
  shoeId: string;
  roundNo: number;
  status: string;
  bettingOpensAt: Date | null;
  bettingClosesAt: Date | null;
};

type LockedBaccaratBettingContext = {
  table: BaccaratTableSnapshot;
  round: BaccaratRoundSnapshot;
};

type LockedBaccaratBettingContextRow = {
  tableId: string;
  tableCode: string;
  tableStatus: string;
  minBet: bigint | string;
  maxMainBet: bigint | string;
  maxTotalBetPerUser: bigint | string;
  tiePayoutNumerator: number;
  tiePayoutDenominator: number;
  bankerCommissionBps: number;
  roundId: string;
  shoeId: string;
  roundNo: number;
  roundStatus: string;
  bettingOpensAt: Date | null;
  bettingClosesAt: Date | null;
};

type BaccaratOddsSnapshot = {
  oddsNumerator: number;
  oddsDenominator: number;
  commissionBpsSnapshot: number;
};

export async function placeBaccaratBet(
  input: PlaceBaccaratBetInput,
): Promise<PlaceBaccaratBetResult> {
  const normalizedInput = normalizePlaceBaccaratBetInput(input);

  return db.transaction((tx) =>
    placeBaccaratBetInTransaction(tx, normalizedInput),
  );
}

export async function placeBaccaratBetInTransaction(
  tx: WalletMutationTransaction,
  input: PlaceBaccaratBetInput,
): Promise<PlaceBaccaratBetResult> {
  const context = await lockBaccaratBettingContext(tx, input);
  const existingBet = await findBaccaratBetByCommand(
    tx,
    context.round.id,
    input.userId,
    input.commandId,
  );

  if (existingBet) {
    assertExistingBaccaratBetMatches(existingBet, input, context);

    return {
      table: context.table,
      round: context.round,
      bet: existingBet,
      walletMutation: await applyWalletMutationInTransaction(
        tx,
        buildExistingBetWalletMutationInput(existingBet, context),
      ),
    };
  }

  assertBaccaratRoundAcceptsBets(context, new Date());

  const odds = getBaccaratOddsSnapshot(input.betType, context.table);
  const existingMainBet = await findBaccaratMainBetForUser(
    tx,
    context.round.id,
    input.userId,
  );

  if (existingMainBet) {
    throw new BaccaratBettingError(
      "BET_ALREADY_PLACED",
      `User ${input.userId} already has a main bet in Baccarat round ${context.round.id}.`,
    );
  }

  const existingTotal = await getBaccaratUserRoundTotal(
    tx,
    context.round.id,
    input.userId,
  );

  if (input.amount < context.table.minBet) {
    throw new BaccaratBettingError(
      "BET_TOO_LOW",
      `Bet amount must be at least ${context.table.minBet.toString()}.`,
    );
  }

  if (input.amount > context.table.maxMainBet) {
    throw new BaccaratBettingError(
      "BET_TOO_HIGH",
      `Bet amount must not exceed ${context.table.maxMainBet.toString()}.`,
    );
  }

  if (existingTotal + input.amount > context.table.maxTotalBetPerUser) {
    throw new BaccaratBettingError(
      "BET_TOO_HIGH",
      `Total Baccarat bets for this round must not exceed ${context.table.maxTotalBetPerUser.toString()}.`,
    );
  }

  const wallet = await getActiveWalletForUpdate(tx, input.userId);
  const availableBalance = wallet.balance - wallet.lockedBalance;

  if (input.amount > availableBalance) {
    throw new BaccaratBettingError(
      "INSUFFICIENT_BALANCE",
      `Insufficient wallet balance for user ${input.userId}.`,
    );
  }

  const walletMutation = await applyWalletMutationInTransaction(
    tx,
    buildBetWalletMutationInput(input, context, odds),
  );
  const now = new Date();
  const [insertedBet] = await tx
    .insert(baccaratBets)
    .values({
      roundId: context.round.id,
      tableId: context.table.id,
      userId: input.userId,
      betType: input.betType,
      betGroup: "MAIN",
      status: "PLACED",
      amount: input.amount,
      oddsNumerator: odds.oddsNumerator,
      oddsDenominator: odds.oddsDenominator,
      commissionBpsSnapshot: odds.commissionBpsSnapshot,
      payoutAmount: zero,
      netAmount: -input.amount,
      placedLedgerId: walletMutation.ledger.id,
      commandId: input.commandId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [baccaratBets.roundId, baccaratBets.userId, baccaratBets.commandId],
    })
    .returning();

  if (!insertedBet) {
    const concurrentBet = await findBaccaratBetByCommand(
      tx,
      context.round.id,
      input.userId,
      input.commandId,
    );

    if (!concurrentBet) {
      throw new BaccaratBettingError(
        "INVALID_BET",
        "Failed to insert Baccarat bet.",
      );
    }

    assertExistingBaccaratBetMatches(concurrentBet, input, context);

    return {
      table: context.table,
      round: context.round,
      bet: concurrentBet,
      walletMutation,
    };
  }

  await insertBaccaratAction(tx, {
    roundId: context.round.id,
    betId: insertedBet.id,
    userId: input.userId,
    actorType: "PLAYER",
    actionType: "PLACE_BET",
    commandId: input.commandId,
    amount: input.amount,
    payload: {
      betType: input.betType,
      betGroup: "MAIN",
      oddsNumerator: odds.oddsNumerator,
      oddsDenominator: odds.oddsDenominator,
      commissionBpsSnapshot: odds.commissionBpsSnapshot,
    },
  });

  return {
    table: context.table,
    round: context.round,
    bet: insertedBet,
    walletMutation,
  };
}

async function lockBaccaratBettingContext(
  tx: WalletMutationTransaction,
  input: PlaceBaccaratBetInput,
): Promise<LockedBaccaratBettingContext> {
  const row = input.roundId
    ? await lockBaccaratRoundById(tx, input.tableCode, input.roundId)
    : await lockLatestBaccaratRoundByTableCode(tx, input.tableCode);

  if (!row) {
    throw new BaccaratBettingError(
      "ROUND_NOT_FOUND",
      `No Baccarat round was found for table ${input.tableCode}.`,
    );
  }

  return {
    table: {
      id: row.tableId,
      code: row.tableCode,
      status: parseBaccaratTableStatus(row.tableStatus),
      minBet: toBigInt(row.minBet),
      maxMainBet: toBigInt(row.maxMainBet),
      maxTotalBetPerUser: toBigInt(row.maxTotalBetPerUser),
      tiePayoutNumerator: Number(row.tiePayoutNumerator),
      tiePayoutDenominator: Number(row.tiePayoutDenominator),
      bankerCommissionBps: Number(row.bankerCommissionBps),
    },
    round: {
      id: row.roundId,
      tableId: row.tableId,
      shoeId: row.shoeId,
      roundNo: Number(row.roundNo),
      status: row.roundStatus,
      bettingOpensAt: toDateOrNull(row.bettingOpensAt),
      bettingClosesAt: toDateOrNull(row.bettingClosesAt),
    },
  };
}

async function lockBaccaratRoundById(
  tx: WalletMutationTransaction,
  tableCode: string,
  roundId: string,
) {
  const result = await tx.execute(sql<LockedBaccaratBettingContextRow>`
    select
      bt.id as "tableId",
      bt.code as "tableCode",
      bt.status as "tableStatus",
      bt.min_bet as "minBet",
      bt.max_main_bet as "maxMainBet",
      bt.max_total_bet_per_user as "maxTotalBetPerUser",
      bt.tie_payout_numerator as "tiePayoutNumerator",
      bt.tie_payout_denominator as "tiePayoutDenominator",
      bt.banker_commission_bps as "bankerCommissionBps",
      br.id as "roundId",
      br.shoe_id as "shoeId",
      br.round_no as "roundNo",
      br.status as "roundStatus",
      br.betting_opens_at as "bettingOpensAt",
      br.betting_closes_at as "bettingClosesAt"
    from baccarat_rounds br
    inner join baccarat_tables bt on bt.id = br.table_id
    where bt.code = ${tableCode}
      and br.id = ${roundId}
    for update of br, bt
  `);
  const [row] = getRows<LockedBaccaratBettingContextRow>(result);

  return row ?? null;
}

async function lockLatestBaccaratRoundByTableCode(
  tx: WalletMutationTransaction,
  tableCode: string,
) {
  const result = await tx.execute(sql<LockedBaccaratBettingContextRow>`
    select
      bt.id as "tableId",
      bt.code as "tableCode",
      bt.status as "tableStatus",
      bt.min_bet as "minBet",
      bt.max_main_bet as "maxMainBet",
      bt.max_total_bet_per_user as "maxTotalBetPerUser",
      bt.tie_payout_numerator as "tiePayoutNumerator",
      bt.tie_payout_denominator as "tiePayoutDenominator",
      bt.banker_commission_bps as "bankerCommissionBps",
      br.id as "roundId",
      br.shoe_id as "shoeId",
      br.round_no as "roundNo",
      br.status as "roundStatus",
      br.betting_opens_at as "bettingOpensAt",
      br.betting_closes_at as "bettingClosesAt"
    from baccarat_rounds br
    inner join baccarat_tables bt on bt.id = br.table_id
    where bt.code = ${tableCode}
    order by br.round_no desc
    limit 1
    for update of br, bt
  `);
  const [row] = getRows<LockedBaccaratBettingContextRow>(result);

  return row ?? null;
}

function assertBaccaratRoundAcceptsBets(
  context: LockedBaccaratBettingContext,
  now: Date,
) {
  if (context.table.status !== "OPEN") {
    throw new BaccaratBettingError(
      "TABLE_NOT_OPEN",
      `Baccarat table ${context.table.code} is ${context.table.status}.`,
    );
  }

  if (context.round.status !== "WAITING_BETS") {
    throw new BaccaratBettingError(
      "BETTING_CLOSED",
      `Baccarat round ${context.round.id} is not accepting bets.`,
    );
  }

  if (context.round.bettingOpensAt && now < context.round.bettingOpensAt) {
    throw new BaccaratBettingError(
      "BETTING_CLOSED",
      `Baccarat round ${context.round.id} betting opens at ${context.round.bettingOpensAt.toISOString()}.`,
    );
  }

  if (context.round.bettingClosesAt && now >= context.round.bettingClosesAt) {
    throw new BaccaratBettingError(
      "BETTING_CLOSED",
      `Baccarat round ${context.round.id} betting closed at ${context.round.bettingClosesAt.toISOString()}.`,
    );
  }
}

async function findBaccaratBetByCommand(
  tx: WalletMutationTransaction,
  roundId: string,
  userId: string,
  commandId: string,
) {
  const [bet] = await tx
    .select()
    .from(baccaratBets)
    .where(
      and(
        eq(baccaratBets.roundId, roundId),
        eq(baccaratBets.userId, userId),
        eq(baccaratBets.commandId, commandId),
      ),
    )
    .limit(1);

  return bet ?? null;
}

async function findBaccaratMainBetForUser(
  tx: WalletMutationTransaction,
  roundId: string,
  userId: string,
) {
  const [bet] = await tx
    .select()
    .from(baccaratBets)
    .where(
      and(
        eq(baccaratBets.roundId, roundId),
        eq(baccaratBets.userId, userId),
        eq(baccaratBets.betGroup, "MAIN"),
      ),
    )
    .limit(1);

  return bet ?? null;
}

async function getBaccaratUserRoundTotal(
  tx: WalletMutationTransaction,
  roundId: string,
  userId: string,
) {
  const result = await tx.execute(sql<{ amount: bigint | string | null }>`
    select coalesce(sum(amount), 0) as amount
    from baccarat_bets
    where round_id = ${roundId}
      and user_id = ${userId}
      and status <> 'CANCELLED'
  `);
  const [row] = getRows<{ amount: bigint | string | null }>(result);

  return toBigInt(row?.amount ?? zero);
}

function assertExistingBaccaratBetMatches(
  bet: typeof baccaratBets.$inferSelect,
  input: PlaceBaccaratBetInput,
  context: LockedBaccaratBettingContext,
) {
  const mismatched =
    bet.roundId !== context.round.id ||
    bet.tableId !== context.table.id ||
    bet.userId !== input.userId ||
    bet.commandId !== input.commandId ||
    bet.betType !== input.betType ||
    bet.betGroup !== "MAIN" ||
    bet.amount !== input.amount;

  if (mismatched) {
    throw new BaccaratBettingError(
      "IDEMPOTENCY_CONFLICT",
      `Command ${input.commandId} was reused with different Baccarat bet details.`,
    );
  }
}

async function insertBaccaratAction(
  tx: WalletMutationTransaction,
  input: {
    roundId: string;
    betId?: string;
    userId?: string;
    actorType: "PLAYER" | "SYSTEM";
    actionType: "PLACE_BET";
    commandId?: string;
    amount: bigint;
    payload: JsonObject;
  },
) {
  await tx
    .insert(baccaratActions)
    .values({
      roundId: input.roundId,
      betId: input.betId ?? null,
      userId: input.userId ?? null,
      actorType: input.actorType,
      actionType: input.actionType,
      actionSequence: await nextActionSequence(tx, input.roundId),
      commandId: input.commandId ?? null,
      amount: input.amount,
      payload: input.payload,
    })
    .onConflictDoNothing();
}

async function nextActionSequence(
  tx: WalletMutationTransaction,
  roundId: string,
) {
  const result = await tx.execute(sql<{ actionSequence: number }>`
    select coalesce(max(action_sequence), 0) + 1 as "actionSequence"
    from baccarat_actions
    where round_id = ${roundId}
  `);
  const [row] = getRows<{ actionSequence: number }>(result);

  return Number(row?.actionSequence ?? 1);
}

function buildBetWalletMutationInput(
  input: PlaceBaccaratBetInput,
  context: LockedBaccaratBettingContext,
  odds: BaccaratOddsSnapshot,
) {
  return {
    userId: input.userId,
    category: "GAME" as const,
    gameType: "BACCARAT" as const,
    type: "BET" as const,
    delta: -input.amount,
    referenceType: "BACCARAT_ROUND",
    referenceId: context.round.id,
    idempotencyKey: `baccarat:bet:${context.round.id}:${input.userId}:${input.commandId}`,
    memo: `Baccarat ${input.betType} bet`,
    metadata: {
      tableCode: context.table.code,
      roundNo: context.round.roundNo,
      betType: input.betType,
      betGroup: "MAIN",
      commandId: input.commandId,
      oddsNumerator: odds.oddsNumerator,
      oddsDenominator: odds.oddsDenominator,
      commissionBpsSnapshot: odds.commissionBpsSnapshot,
    } satisfies JsonObject,
  };
}

function buildExistingBetWalletMutationInput(
  bet: typeof baccaratBets.$inferSelect,
  context: LockedBaccaratBettingContext,
) {
  return {
    userId: bet.userId,
    category: "GAME" as const,
    gameType: "BACCARAT" as const,
    type: "BET" as const,
    delta: -bet.amount,
    referenceType: "BACCARAT_ROUND",
    referenceId: bet.roundId,
    idempotencyKey: `baccarat:bet:${bet.roundId}:${bet.userId}:${bet.commandId}`,
    memo: `Baccarat ${bet.betType} bet`,
    metadata: {
      tableCode: context.table.code,
      roundNo: context.round.roundNo,
      betType: bet.betType,
      betGroup: bet.betGroup,
      commandId: bet.commandId,
      oddsNumerator: bet.oddsNumerator,
      oddsDenominator: bet.oddsDenominator,
      commissionBpsSnapshot: bet.commissionBpsSnapshot,
    } satisfies JsonObject,
  };
}

function getBaccaratOddsSnapshot(
  betType: BaccaratBetType,
  table: BaccaratTableSnapshot,
): BaccaratOddsSnapshot {
  if (betType === "PLAYER") {
    return {
      oddsNumerator: 2,
      oddsDenominator: 1,
      commissionBpsSnapshot: 0,
    };
  }

  if (betType === "BANKER") {
    if (table.bankerCommissionBps % 100 === 0) {
      return {
        oddsNumerator: 200 - table.bankerCommissionBps / 100,
        oddsDenominator: 100,
        commissionBpsSnapshot: table.bankerCommissionBps,
      };
    }

    return {
      oddsNumerator: 20_000 - table.bankerCommissionBps,
      oddsDenominator: 10_000,
      commissionBpsSnapshot: table.bankerCommissionBps,
    };
  }

  return {
    ...reduceFraction(
      table.tiePayoutNumerator + table.tiePayoutDenominator,
      table.tiePayoutDenominator,
    ),
    commissionBpsSnapshot: 0,
  };
}

function reduceFraction(numerator: number, denominator: number) {
  const divisor = gcd(Math.abs(numerator), Math.abs(denominator));

  return {
    oddsNumerator: numerator / divisor,
    oddsDenominator: denominator / divisor,
  };
}

function gcd(left: number, right: number): number {
  let a = left;
  let b = right;

  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }

  return a || 1;
}

function normalizePlaceBaccaratBetInput(
  input: PlaceBaccaratBetInput,
): PlaceBaccaratBetInput {
  const tableCode = input.tableCode.trim();
  const roundId = input.roundId?.trim() || null;
  const userId = input.userId.trim();
  const commandId = input.commandId.trim();
  const betType = parseBaccaratBetType(input.betType);

  if (!tableCode || !userId || !commandId) {
    throw new BaccaratBettingError(
      "INVALID_BET",
      "tableCode, userId, and commandId are required.",
    );
  }

  if (input.amount <= zero) {
    throw new BaccaratBettingError("INVALID_BET", "Bet amount must be positive.");
  }

  return {
    tableCode,
    roundId,
    userId,
    commandId,
    betType,
    amount: input.amount,
  };
}

function parseBaccaratBetType(value: string): BaccaratBetType {
  if (baccaratBetTypes.has(value as BaccaratBetType)) {
    return value as BaccaratBetType;
  }

  throw new BaccaratBettingError(
    "INVALID_BET",
    `Unsupported Baccarat bet type ${value}.`,
  );
}

function parseBaccaratTableStatus(
  status: string,
): BaccaratTableSnapshot["status"] {
  if (status === "OPEN" || status === "MAINTENANCE" || status === "CLOSED") {
    return status;
  }

  throw new BaccaratBettingError(
    "TABLE_NOT_OPEN",
    `Baccarat table has unsupported status ${status}.`,
  );
}

function getRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }

  return [];
}

function toBigInt(value: bigint | string | number) {
  return typeof value === "bigint" ? value : BigInt(value);
}

function toDateOrNull(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}
