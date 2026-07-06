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
  cancelBaccaratRound,
  db,
  ensureUserGameAccount,
  placeBaccaratBet,
  pointLedgers,
  pool,
  settleBaccaratRound,
  type SettleBaccaratBetResult,
  userProfiles,
  wallets,
} from "../src/index";

const runId = Date.now();
const tableCode = `baccarat-settlement-smoke-${runId}`;
const userIds = [
  `baccarat-settlement-a-${runId}`,
  `baccarat-settlement-b-${runId}`,
  `baccarat-settlement-c-${runId}`,
];

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

  for (const userId of userIds) {
    await db.delete(pointLedgers).where(eq(pointLedgers.userId, userId));
    await db.delete(wallets).where(eq(wallets.userId, userId));
    await db.delete(userProfiles).where(eq(userProfiles.userId, userId));
    await db.delete(authUsers).where(eq(authUsers.id, userId));
  }
}

async function createRound(input: {
  tableId: string;
  shoeId: string;
  roundNo: number;
}) {
  const [round] = await db
    .insert(baccaratRounds)
    .values({
      tableId: input.tableId,
      shoeId: input.shoeId,
      roundIndexInShoe: input.roundNo,
      roundNo: input.roundNo,
      status: "WAITING_BETS",
      bettingOpensAt: new Date(Date.now() - 1_000),
      bettingClosesAt: new Date(Date.now() + 60_000),
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
    throw new Error(`Failed to create Baccarat settlement round ${input.roundNo}.`);
  }

  return round;
}

async function moveRoundToSettling(roundId: string) {
  await db
    .update(baccaratRounds)
    .set({
      status: "SETTLING",
      updatedAt: new Date(),
    })
    .where(eq(baccaratRounds.id, roundId));
}

function findBetResult(
  results: SettleBaccaratBetResult[],
  betId: string,
): SettleBaccaratBetResult {
  const result = results.find((candidate) => candidate.betId === betId);

  if (!result) {
    throw new Error(`Missing Baccarat settlement result for bet ${betId}.`);
  }

  return result;
}

try {
  await cleanup();

  for (const [index, userId] of userIds.entries()) {
    await db.insert(authUsers).values({
      id: userId,
      name: `Baccarat Settlement Smoke ${index + 1}`,
      email: `${userId}@example.com`,
      emailVerified: false,
    });
    await ensureUserGameAccount({
      userId,
      displayName: `Baccarat Settlement Smoke ${index + 1}`,
    });
    await applyWalletMutation({
      userId,
      category: "ADMIN",
      type: "ADMIN_ADJUST",
      delta: 10_000n,
      referenceType: "BACCARAT_SETTLEMENT_SMOKE",
      referenceId: `grant:${userId}`,
      idempotencyKey: `baccarat-settlement-smoke:grant:${userId}`,
    });
  }

  const [table] = await db
    .insert(baccaratTables)
    .values({
      code: tableCode,
      name: "Baccarat Settlement Smoke Table",
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
    throw new Error("Failed to create Baccarat settlement smoke table.");
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
      serverSeedHash: `baccarat-settlement-smoke:${runId}`,
    })
    .returning();

  if (!shoe) {
    throw new Error("Failed to create Baccarat settlement smoke shoe.");
  }

  const [userA, userB, userC] = userIds;

  if (!userA || !userB || !userC) {
    throw new Error("Baccarat settlement smoke requires three users.");
  }

  const playerRound = await createRound({
    tableId: table.id,
    shoeId: shoe.id,
    roundNo: 1,
  });
  const playerWinBet = await placeBaccaratBet({
    tableCode,
    roundId: playerRound.id,
    userId: userA,
    amount: 100n,
    commandId: "round-1-player",
    betType: "PLAYER",
  });
  const bankerLossBet = await placeBaccaratBet({
    tableCode,
    roundId: playerRound.id,
    userId: userB,
    amount: 100n,
    commandId: "round-1-banker",
    betType: "BANKER",
  });
  await placeBaccaratBet({
    tableCode,
    roundId: playerRound.id,
    userId: userC,
    amount: 100n,
    commandId: "round-1-tie",
    betType: "TIE",
  });
  await moveRoundToSettling(playerRound.id);
  const playerSettlementInput = {
    roundId: playerRound.id,
    outcome: "PLAYER" as const,
    playerTotal: 8,
    bankerTotal: 2,
    isNatural: true,
    totalCards: 4,
  };
  const playerSettlement = await settleBaccaratRound(playerSettlementInput);
  const playerSettlementRetry = await settleBaccaratRound(playerSettlementInput);
  const settledPlayerWin = findBetResult(
    playerSettlement.bets,
    playerWinBet.bet.id,
  );
  const settledBankerLoss = findBetResult(
    playerSettlement.bets,
    bankerLossBet.bet.id,
  );
  const retriedPlayerWin = findBetResult(
    playerSettlementRetry.bets,
    playerWinBet.bet.id,
  );

  const bankerRound = await createRound({
    tableId: table.id,
    shoeId: shoe.id,
    roundNo: 2,
  });
  const bankerWinBet = await placeBaccaratBet({
    tableCode,
    roundId: bankerRound.id,
    userId: userA,
    amount: 100n,
    commandId: "round-2-banker",
    betType: "BANKER",
  });
  await placeBaccaratBet({
    tableCode,
    roundId: bankerRound.id,
    userId: userB,
    amount: 100n,
    commandId: "round-2-player",
    betType: "PLAYER",
  });
  await moveRoundToSettling(bankerRound.id);
  const bankerSettlement = await settleBaccaratRound({
    roundId: bankerRound.id,
    outcome: "BANKER",
    playerTotal: 4,
    bankerTotal: 7,
    totalCards: 5,
  });
  const settledBankerWin = findBetResult(
    bankerSettlement.bets,
    bankerWinBet.bet.id,
  );

  const tieRound = await createRound({
    tableId: table.id,
    shoeId: shoe.id,
    roundNo: 3,
  });
  const playerPushBet = await placeBaccaratBet({
    tableCode,
    roundId: tieRound.id,
    userId: userA,
    amount: 100n,
    commandId: "round-3-player",
    betType: "PLAYER",
  });
  const bankerPushBet = await placeBaccaratBet({
    tableCode,
    roundId: tieRound.id,
    userId: userB,
    amount: 100n,
    commandId: "round-3-banker",
    betType: "BANKER",
  });
  const tieWinBet = await placeBaccaratBet({
    tableCode,
    roundId: tieRound.id,
    userId: userC,
    amount: 100n,
    commandId: "round-3-tie",
    betType: "TIE",
  });
  await moveRoundToSettling(tieRound.id);
  const tieSettlement = await settleBaccaratRound({
    roundId: tieRound.id,
    outcome: "TIE",
    playerTotal: 6,
    bankerTotal: 6,
    totalCards: 6,
  });
  const settledPlayerPush = findBetResult(
    tieSettlement.bets,
    playerPushBet.bet.id,
  );
  const settledBankerPush = findBetResult(
    tieSettlement.bets,
    bankerPushBet.bet.id,
  );
  const settledTieWin = findBetResult(tieSettlement.bets, tieWinBet.bet.id);

  const cancelRound = await createRound({
    tableId: table.id,
    shoeId: shoe.id,
    roundNo: 4,
  });
  await placeBaccaratBet({
    tableCode,
    roundId: cancelRound.id,
    userId: userA,
    amount: 500n,
    commandId: "round-4-player",
    betType: "PLAYER",
  });
  await placeBaccaratBet({
    tableCode,
    roundId: cancelRound.id,
    userId: userB,
    amount: 600n,
    commandId: "round-4-banker",
    betType: "BANKER",
  });
  await placeBaccaratBet({
    tableCode,
    roundId: cancelRound.id,
    userId: userC,
    amount: 700n,
    commandId: "round-4-tie",
    betType: "TIE",
  });
  const cancellation = await cancelBaccaratRound({
    roundId: cancelRound.id,
    reason: "BACCARAT_SETTLEMENT_SMOKE_CANCEL",
  });
  const cancellationRetry = await cancelBaccaratRound({
    roundId: cancelRound.id,
    reason: "BACCARAT_SETTLEMENT_SMOKE_CANCEL",
  });

  const walletsByUserId = new Map(
    (
      await Promise.all(
        userIds.map(async (userId) => {
          const [wallet] = await db
            .select()
            .from(wallets)
            .where(eq(wallets.userId, userId))
            .limit(1);

          if (!wallet) {
            throw new Error(`Missing wallet for ${userId}.`);
          }

          return [userId, wallet] as const;
        }),
      )
    ).map(([userId, wallet]) => [userId, wallet]),
  );

  const ledgersByUser = await Promise.all(
    userIds.map(async (userId) => ({
      userId,
      ledgers: await db
        .select()
        .from(pointLedgers)
        .where(eq(pointLedgers.userId, userId)),
    })),
  );
  const allLedgers = ledgersByUser.flatMap((entry) => entry.ledgers);
  const bets = await db
    .select()
    .from(baccaratBets)
    .where(eq(baccaratBets.tableId, table.id));

  const summary = {
    tableCode,
    playerPayout: settledPlayerWin.payoutAmount.toString(),
    playerNet: settledPlayerWin.netAmount.toString(),
    playerRetryIdempotent: retriedPlayerWin.walletMutation?.idempotent,
    bankerLossOutcome: settledBankerLoss.outcome,
    bankerLossPayout: settledBankerLoss.payoutAmount.toString(),
    bankerLossWalletMutation: settledBankerLoss.walletMutation,
    bankerPayout: settledBankerWin.payoutAmount.toString(),
    bankerNet: settledBankerWin.netAmount.toString(),
    playerPushRefund: settledPlayerPush.payoutAmount.toString(),
    playerPushLedger: settledPlayerPush.ledgerType,
    bankerPushRefund: settledBankerPush.payoutAmount.toString(),
    bankerPushLedger: settledBankerPush.ledgerType,
    tiePayout: settledTieWin.payoutAmount.toString(),
    tieNet: settledTieWin.netAmount.toString(),
    cancelRefundCount: cancellation.bets.length,
    cancelRetryIdempotent: cancellationRetry.bets.every(
      (bet) => bet.walletMutation.idempotent,
    ),
    userABalance: walletsByUserId.get(userA)?.balance.toString(),
    userBBalance: walletsByUserId.get(userB)?.balance.toString(),
    userCBalance: walletsByUserId.get(userC)?.balance.toString(),
    adminLedgerCount: allLedgers.filter((ledger) => ledger.type === "ADMIN_ADJUST")
      .length,
    betLedgerCount: allLedgers.filter((ledger) => ledger.type === "BET").length,
    payoutLedgerCount: allLedgers.filter((ledger) => ledger.type === "PAYOUT")
      .length,
    pushLedgerCount: allLedgers.filter(
      (ledger) => ledger.type === "PUSH_REFUND",
    ).length,
    cancelLedgerCount: allLedgers.filter(
      (ledger) => ledger.type === "CANCEL_REFUND",
    ).length,
    settledBetCount: bets.filter((bet) => bet.status === "SETTLED").length,
    cancelledBetCount: bets.filter((bet) => bet.status === "CANCELLED").length,
  };

  if (
    summary.playerPayout !== "200" ||
    summary.playerNet !== "100" ||
    !summary.playerRetryIdempotent ||
    summary.bankerLossOutcome !== "LOSE" ||
    summary.bankerLossPayout !== "0" ||
    summary.bankerLossWalletMutation !== null ||
    summary.bankerPayout !== "195" ||
    summary.bankerNet !== "95" ||
    summary.playerPushRefund !== "100" ||
    summary.playerPushLedger !== "PUSH_REFUND" ||
    summary.bankerPushRefund !== "100" ||
    summary.bankerPushLedger !== "PUSH_REFUND" ||
    summary.tiePayout !== "900" ||
    summary.tieNet !== "800" ||
    summary.cancelRefundCount !== 3 ||
    !summary.cancelRetryIdempotent ||
    summary.userABalance !== "10195" ||
    summary.userBBalance !== "9800" ||
    summary.userCBalance !== "10700" ||
    summary.adminLedgerCount !== 3 ||
    summary.betLedgerCount !== 11 ||
    summary.payoutLedgerCount !== 3 ||
    summary.pushLedgerCount !== 2 ||
    summary.cancelLedgerCount !== 3 ||
    summary.settledBetCount !== 8 ||
    summary.cancelledBetCount !== 3
  ) {
    throw new Error(
      `Unexpected Baccarat settlement smoke result: ${JSON.stringify(summary)}`,
    );
  }

  console.log(JSON.stringify(summary, null, 2));
} finally {
  await cleanup();
  await pool.end();
}
