import assert from "node:assert/strict";
import { once } from "node:events";
import { readdir, readFile } from "node:fs/promises";
import net from "node:net";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertCardGamesEnabled,
  CardGamesDisabledError,
  isCardGamesEnabled,
} from "./card-games.js";

// Stands in for Postgres so this file can never reach a real database: it
// counts every connection attempt and drops it.
let connectionAttempts = 0;

const server = net.createServer((socket) => {
  connectionAttempts += 1;
  socket.on("error", () => undefined);
  socket.destroy();
});

// A transaction handle that records and rejects any use, so an entry point
// that gets past its guard cannot go unnoticed.
const transactionTouches: string[] = [];

const tx = new Proxy(
  {},
  {
    get(_target, property) {
      transactionTouches.push(String(property));
      throw new Error(`transaction.${String(property)} was used`);
    },
  },
);

// The guard runs before any argument is read, so a placeholder input is enough.
const input = {};

// Every exported function that reads or writes blackjack_* or baccarat_*
// tables, with the arguments it is called with below.
const guardedEntryPoints = {
  admin: {
    setBlackjackTableStatus: [input],
  },
  baccaratBetting: {
    placeBaccaratBet: [input],
    placeBaccaratBetInTransaction: [tx, input],
  },
  baccaratSeed: {
    ensureMainBaccaratSeed: [],
    getBaccaratTableByCode: ["main"],
  },
  baccaratSettlement: {
    cancelBaccaratRound: [input],
    cancelBaccaratRoundInTransaction: [tx, input],
    settleBaccaratRound: [input],
    settleBaccaratRoundInTransaction: [tx, input],
  },
  blackjackBetting: {
    doubleBlackjackBet: [input],
    doubleBlackjackBetInTransaction: [tx, input],
    ensureMainBlackjackTable: [],
    getBlackjackTableByCode: ["main"],
    placeBlackjackInitialBet: [input],
    placeBlackjackInitialBetInTransaction: [tx, input],
    placeBlackjackInsuranceBet: [input],
    placeBlackjackInsuranceBetInTransaction: [tx, input],
    splitBlackjackBet: [input],
    splitBlackjackBetInTransaction: [tx, input],
  },
  blackjackSettlement: {
    settleBlackjackRound: [input],
    settleBlackjackRoundInTransaction: [tx, input],
  },
} satisfies Record<string, Record<string, unknown[]>>;

type ModuleName = keyof typeof guardedEntryPoints;

// Exported functions that are deliberately left unguarded: the error classes
// are constructors that never query, and the generic admin entry points do not
// touch card-game tables and must keep working while the games are off.
const unguardedExports: Record<ModuleName, string[]> = {
  admin: ["AdminMutationError", "adjustUserPoints", "assertAdminUser"],
  baccaratBetting: ["BaccaratBettingError"],
  baccaratSeed: [],
  baccaratSettlement: ["BaccaratSettlementError"],
  blackjackBetting: ["BlackjackBettingError"],
  blackjackSettlement: ["BlackjackSettlementError"],
};

let client: typeof import("./client.js");
let modules: Record<ModuleName, Record<string, unknown>>;

before(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as net.AddressInfo;

  process.env.DATABASE_URL = `postgresql://test:test@127.0.0.1:${port}/test`;
  client = await import("./client.js");
  modules = {
    admin: await import("./admin.js"),
    baccaratBetting: await import("./baccarat-betting.js"),
    baccaratSeed: await import("./baccarat-seed.js"),
    baccaratSettlement: await import("./baccarat-settlement.js"),
    blackjackBetting: await import("./blackjack-betting.js"),
    blackjackSettlement: await import("./blackjack-settlement.js"),
  };
});

after(async () => {
  await client?.pool.end();
  server.close();
});

beforeEach(() => {
  connectionAttempts = 0;
  transactionTouches.length = 0;
});

test("only the exact string true enables card games", () => {
  const cases: Array<[string | undefined, boolean]> = [
    [undefined, false],
    ["", false],
    ["true", true],
    ["TRUE", false],
    ["1", false],
    [" true ", false],
    ["false", false],
  ];

  for (const [value, expected] of cases) {
    assert.equal(
      isCardGamesEnabled({ CARD_GAMES_ENABLED: value }),
      expected,
      `CARD_GAMES_ENABLED=${JSON.stringify(value)}`,
    );
  }
});

test("assertCardGamesEnabled throws a stable code only while disabled", async () => {
  await withSwitch(undefined, () => {
    assert.throws(assertCardGamesEnabled, (error: unknown) => {
      assert.ok(error instanceof CardGamesDisabledError);
      assert.equal(error.code, "CARD_GAMES_DISABLED");
      assert.equal(error.name, "CardGamesDisabledError");
      return true;
    });
  });

  await withSwitch("true", () => {
    assert.equal(assertCardGamesEnabled(), undefined);
  });
});

test("every card-game entry point rejects without touching the database while disabled", async () => {
  await withSwitch(undefined, async () => {
    for (const [name, call] of guardedCalls()) {
      await assert.rejects(
        call,
        (error: unknown) => {
          assert.ok(
            error instanceof CardGamesDisabledError,
            `${name} rejected with ${String(error)}`,
          );
          assert.equal(error.code, "CARD_GAMES_DISABLED");
          return true;
        },
        `${name} did not reject`,
      );
    }
  });

  assert.equal(connectionAttempts, 0);
  assert.equal(client.pool.totalCount, 0);
  assert.deepEqual(transactionTouches, []);
});

// Without this the previous test could pass against a stand-in that never
// notices a query: once enabled, the same calls must show up as real work.
test("the guards step aside once the switch is on", async () => {
  await withSwitch("true", async () => {
    for (const [name, call] of guardedCalls()) {
      await assert.rejects(
        call,
        (error: unknown) => {
          assert.ok(
            !(error instanceof CardGamesDisabledError),
            `${name} is still guarded`,
          );
          return true;
        },
        `${name} did not reject`,
      );
    }
  });

  assert.ok(connectionAttempts > 0);
  assert.ok(transactionTouches.length > 0);
});

test("every exported card-game function is guarded or explicitly exempt", () => {
  for (const moduleName of Object.keys(modules) as ModuleName[]) {
    const exportedFunctions = Object.entries(modules[moduleName])
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name);

    assert.deepEqual(
      exportedFunctions.sort(),
      [
        ...Object.keys(guardedEntryPoints[moduleName]),
        ...unguardedExports[moduleName],
      ].sort(),
      moduleName,
    );
  }
});

// The scan above only knows the modules listed in this file. A card-table
// query added anywhere else in the package has to be brought under it.
test("card-game tables are only used by the modules scanned above", async () => {
  const sourceDirectory = fileURLToPath(new URL(".", import.meta.url));
  const notScanned = ["card-games.ts", "index.ts", "schema.ts"];
  const usesCardTables: string[] = [];

  for (const file of await readdir(sourceDirectory)) {
    if (
      !file.endsWith(".ts") ||
      file.endsWith(".test.ts") ||
      notScanned.includes(file)
    ) {
      continue;
    }

    const source = await readFile(`${sourceDirectory}${file}`, "utf8");

    if (/\b(blackjack|baccarat)[A-Z]\w*/.test(source)) {
      usesCardTables.push(file);
    }
  }

  assert.deepEqual(usesCardTables.sort(), [
    "admin.ts",
    "baccarat-betting.ts",
    "baccarat-seed.ts",
    "baccarat-settlement.ts",
    "blackjack-betting.ts",
    "blackjack-settlement.ts",
  ]);
});

function guardedCalls(): Array<[string, () => Promise<unknown>]> {
  return Object.entries(guardedEntryPoints).flatMap(
    ([moduleName, entryPoints]) =>
      Object.entries(entryPoints).map(
        ([name, args]): [string, () => Promise<unknown>] => [
          `${moduleName}.${name}`,
          () => {
            const entryPoint = modules[moduleName as ModuleName][name] as (
              ...args: unknown[]
            ) => Promise<unknown>;

            return entryPoint(...args);
          },
        ],
      ),
  );
}

// A developer's .env may set the switch, so each test states the value it
// needs and puts the previous one back.
async function withSwitch(
  value: string | undefined,
  run: () => void | Promise<void>,
) {
  const previous = process.env.CARD_GAMES_ENABLED;
  setSwitch(value);

  try {
    await run();
  } finally {
    setSwitch(previous);
  }
}

function setSwitch(value: string | undefined) {
  if (value === undefined) {
    delete process.env.CARD_GAMES_ENABLED;
  } else {
    process.env.CARD_GAMES_ENABLED = value;
  }
}
