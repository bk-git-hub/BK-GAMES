import { ensureMainBlackjackTable } from "../src/blackjack-betting";
import { pool } from "../src/client";

async function main() {
  const table = await ensureMainBlackjackTable();

  console.log(
    JSON.stringify(
      {
        code: table.code,
        id: table.id,
        minInitialBet: table.minInitialBet.toString(),
        maxInitialBet: table.maxInitialBet.toString(),
        maxSeats: table.maxSeats,
        maxSeatsPerUser: table.maxSeatsPerUser,
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
