import { ensureMainRacingSeed, pool } from "../src/index";

async function main() {
  const seed = await ensureMainRacingSeed();

  console.log(
    JSON.stringify(
      {
        table: {
          code: seed.table.code,
          id: seed.table.id,
          fieldSize: seed.table.fieldSize,
          minBet: seed.table.minBet.toString(),
          maxBet: seed.table.maxBet.toString(),
          payoutRateBps: seed.table.payoutRateBps,
          bettingTimeoutSeconds: seed.table.bettingTimeoutSeconds,
          raceIntervalSeconds: seed.table.raceIntervalSeconds,
          bettingCloseBeforeStartSeconds:
            seed.table.bettingCloseBeforeStartSeconds,
          tickIntervalMs: seed.table.tickIntervalMs,
          raceDistanceM: seed.table.raceDistanceM,
          roundEndDelaySeconds: seed.table.roundEndDelaySeconds,
        },
        horses: seed.horses.map((horse) => ({
          id: horse.id,
          name: horse.name,
          silkColor: horse.silkColor,
          isActive: horse.isActive,
        })),
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
