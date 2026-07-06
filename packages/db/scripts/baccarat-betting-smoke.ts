import { eq } from "drizzle-orm";

import {
  applyWalletMutation,
  authUsers,
  baccaratActions,
  baccaratBets,
  baccaratReveals,
  baccaratRounds,
  baccaratShoes,
  baccaratTables,
  db,
  ensureUserGameAccount,
  placeBaccaratBet,
  pointLedgers,
  pool,
  userProfiles,
  wallets,
} from "../src/index";

const runId = Date.now();
const userId = `baccarat-bet-smoke-${runId}`;
const tableCode = `baccarat-bet-smoke-${runId}`;
const email = `${userId}@example.com`;

async function cleanup() {
  const [table] = await db
    .select()
    .from(baccaratTables)
    .where(eq(baccaratTables.code, tableCode))
    .limit(1);

  if (table) {
    const rounds = await db
      .select({ id: baccaratRounds.id })
      .from(baccaratRounds)
      .where(eq(baccaratRounds.tableId, table.id));

    for (const round of rounds) {
      await db
        .delete(baccaratActions)
        .where(eq(baccaratActions.roundId, round.id));
      await db
        .delete(baccaratReveals)
        .where(eq(baccaratReveals.roundId, round.id));
      await db.delete(baccaratBets).where(eq(baccaratBets.roundId, round.id));
      await db.delete(baccaratRounds).where(eq(baccaratRounds.id, round.id));
    }

    await db.delete(baccaratShoes).where(eq(baccaratShoes.tableId, table.id));
    await db.delete(baccaratTables).where(eq(baccaratTables.id, table.id));
  }

  await db.delete(pointLedgers).where(eq(pointLedgers.userId, userId));
  await db.delete(wallets).where(eq(wallets.userId, userId));
  await db.delete(userProfiles).where(eq(userProfiles.userId, userId));
  await db.delete(authUsers).where(eq(authUsers.id, userId));
}

async function createRound(input: {
  tableId: string;
  shoeId: string;
  roundNo: number;
  bettingOpensAt: Date;
  bettingClosesAt: Date;
}) {
  const [round] = await db
    .insert(baccaratRounds)
    .values({
      tableId: input.tableId,
      shoeId: input.shoeId,
      roundIndexInShoe: input.roundNo,
      roundNo: input.roundNo,
      status: "WAITING_BETS",
      bettingOpensAt: input.bettingOpensAt,
      bettingClosesAt: input.bettingClosesAt,
      ruleSnapshot: {
        deckCount: 8,
        shoePenetrationPercent: 75,
        minimumCardsBeforeRound: 6,
        tiePayout: {
          numerator: 8,
          denominator: 1,
        },
        bankerCommissionBps: 500,
        betTypes: ["PLAYER", "BANKER", "TIE"],
        roadmaps: {
          beadPlate: true,
          basicBigRoad: true,
        },
      },
    })
    .returning();

  if (!round) {
    throw new Error(`Failed to create Baccarat smoke round ${input.roundNo}.`);
  }

  return round;
}

function getErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code: unknown }).code)
    : null;
}

async function captureErrorCode(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return getErrorCode(error);
  }

  return null;
}

try {
  await cleanup();

  await db.insert(authUsers).values({
    id: userId,
    name: "Baccarat Bet Smoke",
    email,
    emailVerified: false,
  });
  await ensureUserGameAccount({
    userId,
    displayName: "Baccarat Bet Smoke",
  });

  const [table] = await db
    .insert(baccaratTables)
    .values({
      code: tableCode,
      name: "Baccarat Bet Smoke Table",
      minBet: 100n,
      maxMainBet: 20_000n,
      maxTotalBetPerUser: 20_000n,
      bettingTimeoutSeconds: 15,
      squeezeTimeoutSeconds: 8,
      roundEndDelaySeconds: 5,
      deckCount: 8,
      shoePenetrationPercent: 75,
      minimumCardsBeforeRound: 6,
      resultHistoryLimit: 72,
      tiePayoutNumerator: 8,
      tiePayoutDenominator: 1,
      bankerCommissionBps: 500,
    })
    .returning();

  if (!table) {
    throw new Error("Failed to create Baccarat betting smoke table.");
  }

  const [shoe] = await db
    .insert(baccaratShoes)
    .values({
      tableId: table.id,
      shoeNo: 1,
      status: "ACTIVE",
      deckCount: 8,
      cardsTotal: 416,
      cardsDealt: 0,
      cardsRemaining: 416,
      cutCardPosition: 312,
      serverSeedHash: `baccarat-bet-smoke:${userId}`,
    })
    .returning();

  if (!shoe) {
    throw new Error("Failed to create Baccarat betting smoke shoe.");
  }

  await applyWalletMutation({
    userId,
    category: "ADMIN",
    type: "ADMIN_ADJUST",
    delta: 10_000n,
    referenceType: "BACCARAT_BET_SMOKE",
    referenceId: `grant:${userId}`,
    idempotencyKey: `baccarat-bet-smoke:grant:${userId}`,
  });

  const now = Date.now();
  const activeOpen = new Date(now - 1_000);
  const activeClose = new Date(now + 60_000);
  const closedOpen = new Date(now - 60_000);
  const closedClose = new Date(now - 1_000);
  const rounds = await Promise.all(
    Array.from({ length: 7 }, (_, index) =>
      createRound({
        tableId: table.id,
        shoeId: shoe.id,
        roundNo: index + 1,
        bettingOpensAt: index === 6 ? closedOpen : activeOpen,
        bettingClosesAt: index === 6 ? closedClose : activeClose,
      }),
    ),
  );

  const playerBetInput = {
    tableCode,
    roundId: rounds[0]!.id,
    userId,
    amount: 1_000n,
    commandId: "command-player",
    betType: "PLAYER" as const,
  };
  const playerBet = await placeBaccaratBet(playerBetInput);
  const playerBetRetry = await placeBaccaratBet(playerBetInput);
  const idempotencyConflictCode = await captureErrorCode(() =>
    placeBaccaratBet({
      ...playerBetInput,
      amount: 1_100n,
    }),
  );
  const duplicateMainBetCode = await captureErrorCode(() =>
    placeBaccaratBet({
      tableCode,
      roundId: rounds[0]!.id,
      userId,
      amount: 100n,
      commandId: "command-duplicate-main",
      betType: "BANKER",
    }),
  );

  const bankerBet = await placeBaccaratBet({
    tableCode,
    roundId: rounds[1]!.id,
    userId,
    amount: 100n,
    commandId: "command-banker",
    betType: "BANKER",
  });
  const tieBet = await placeBaccaratBet({
    tableCode,
    roundId: rounds[2]!.id,
    userId,
    amount: 100n,
    commandId: "command-tie",
    betType: "TIE",
  });
  const insufficientFundsCode = await captureErrorCode(() =>
    placeBaccaratBet({
      tableCode,
      roundId: rounds[3]!.id,
      userId,
      amount: 9_000n,
      commandId: "command-insufficient",
      betType: "PLAYER",
    }),
  );
  const tooLowCode = await captureErrorCode(() =>
    placeBaccaratBet({
      tableCode,
      roundId: rounds[4]!.id,
      userId,
      amount: 50n,
      commandId: "command-too-low",
      betType: "PLAYER",
    }),
  );
  const tooHighCode = await captureErrorCode(() =>
    placeBaccaratBet({
      tableCode,
      roundId: rounds[5]!.id,
      userId,
      amount: 20_001n,
      commandId: "command-too-high",
      betType: "PLAYER",
    }),
  );
  const closedBettingCode = await captureErrorCode(() =>
    placeBaccaratBet({
      tableCode,
      roundId: rounds[6]!.id,
      userId,
      amount: 100n,
      commandId: "command-closed",
      betType: "PLAYER",
    }),
  );

  const [wallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1);
  const ledgers = await db
    .select()
    .from(pointLedgers)
    .where(eq(pointLedgers.userId, userId));
  const actions = await db
    .select()
    .from(baccaratActions)
    .where(eq(baccaratActions.userId, userId));

  const summary = {
    userId,
    tableCode,
    playerBetBalance: playerBet.walletMutation.wallet.balance.toString(),
    playerBetRetryIdempotent: playerBetRetry.walletMutation.idempotent,
    samePlayerBet: playerBet.bet.id === playerBetRetry.bet.id,
    samePlayerLedger:
      playerBet.walletMutation.ledger.id ===
      playerBetRetry.walletMutation.ledger.id,
    playerOdds: `${playerBet.bet.oddsNumerator}/${playerBet.bet.oddsDenominator}`,
    bankerOdds: `${bankerBet.bet.oddsNumerator}/${bankerBet.bet.oddsDenominator}`,
    bankerCommissionBps: bankerBet.bet.commissionBpsSnapshot,
    tieOdds: `${tieBet.bet.oddsNumerator}/${tieBet.bet.oddsDenominator}`,
    idempotencyConflictCode,
    duplicateMainBetCode,
    insufficientFundsCode,
    tooLowCode,
    tooHighCode,
    closedBettingCode,
    finalBalance: wallet?.balance.toString(),
    betLedgerCount: ledgers.filter((ledger) => ledger.type === "BET").length,
    totalLedgerCount: ledgers.length,
    actionCount: actions.length,
  };

  if (
    summary.playerBetBalance !== "9000" ||
    !summary.playerBetRetryIdempotent ||
    !summary.samePlayerBet ||
    !summary.samePlayerLedger ||
    summary.playerOdds !== "2/1" ||
    summary.bankerOdds !== "195/100" ||
    summary.bankerCommissionBps !== 500 ||
    summary.tieOdds !== "9/1" ||
    summary.idempotencyConflictCode !== "IDEMPOTENCY_CONFLICT" ||
    summary.duplicateMainBetCode !== "BET_ALREADY_PLACED" ||
    summary.insufficientFundsCode !== "INSUFFICIENT_BALANCE" ||
    summary.tooLowCode !== "BET_TOO_LOW" ||
    summary.tooHighCode !== "BET_TOO_HIGH" ||
    summary.closedBettingCode !== "BETTING_CLOSED" ||
    summary.finalBalance !== "8800" ||
    summary.betLedgerCount !== 3 ||
    summary.totalLedgerCount !== 4 ||
    summary.actionCount !== 3
  ) {
    throw new Error(
      `Unexpected Baccarat betting smoke result: ${JSON.stringify(summary)}`,
    );
  }

  console.log(JSON.stringify(summary, null, 2));
} finally {
  await cleanup();
  await pool.end();
}
