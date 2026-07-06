import { ensureMainBaccaratSeed, pool } from "../src/index";

async function main() {
  const seed = await ensureMainBaccaratSeed();

  console.log(
    JSON.stringify(
      {
        table: {
          code: seed.table.code,
          id: seed.table.id,
          minBet: seed.table.minBet.toString(),
          maxMainBet: seed.table.maxMainBet.toString(),
          maxTotalBetPerUser: seed.table.maxTotalBetPerUser.toString(),
          bettingTimeoutSeconds: seed.table.bettingTimeoutSeconds,
          squeezeTimeoutSeconds: seed.table.squeezeTimeoutSeconds,
          roundEndDelaySeconds: seed.table.roundEndDelaySeconds,
          deckCount: seed.table.deckCount,
          shoePenetrationPercent: seed.table.shoePenetrationPercent,
          minimumCardsBeforeRound: seed.table.minimumCardsBeforeRound,
          resultHistoryLimit: seed.table.resultHistoryLimit,
          tiePayoutNumerator: seed.table.tiePayoutNumerator,
          tiePayoutDenominator: seed.table.tiePayoutDenominator,
          bankerCommissionBps: seed.table.bankerCommissionBps,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .finally(() => pool.end())
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
