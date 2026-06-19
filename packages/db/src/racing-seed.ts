import { asc, eq } from "drizzle-orm";

import { db } from "./client.js";
import { racingHorses, racingTables, type JsonObject } from "./schema.js";

export const MAIN_RACING_TABLE_CODE = "main";

export const MAIN_RACING_HORSES = [
  {
    name: "Crimson Circuit",
    silkColor: "#d83a34",
  },
  {
    name: "Azure Relay",
    silkColor: "#2563eb",
  },
  {
    name: "Golden Vector",
    silkColor: "#d99a21",
  },
  {
    name: "Emerald Drift",
    silkColor: "#16834a",
  },
  {
    name: "Ivory Signal",
    silkColor: "#e5e1d8",
  },
  {
    name: "Violet Comet",
    silkColor: "#7c3aed",
  },
] as const;

export type MainRacingSeedResult = {
  table: typeof racingTables.$inferSelect;
  horses: Array<typeof racingHorses.$inferSelect>;
};

const standardMainRacingTiming = {
  bettingTimeoutSeconds: 150,
  raceIntervalSeconds: 240,
  raceAndResultSeconds: 60,
  bettingCloseBeforeStartSeconds: 30,
};

const developmentMainRacingTiming = {
  bettingTimeoutSeconds: 30,
  raceIntervalSeconds: 90,
  raceAndResultSeconds: 60,
  bettingCloseBeforeStartSeconds: 0,
};

const activeMainRacingTiming = standardMainRacingTiming;

const mainRacingRules = {
  betTypes: [
    "WIN",
    "PLACE",
    "QUINELLA",
    "EXACTA",
    "QUINELLA_PLACE",
    "TRIO",
    "TRIFECTA",
  ],
  equalBaseStats: true,
  fixedOdds: true,
  oddsDenominator: 10_000,
  raceIntervalSeconds: activeMainRacingTiming.raceIntervalSeconds,
  raceAndResultSeconds: activeMainRacingTiming.raceAndResultSeconds,
  bettingCloseBeforeStartSeconds:
    activeMainRacingTiming.bettingCloseBeforeStartSeconds,
  developmentTiming: {
    enabled: false,
    shortcutTiming: developmentMainRacingTiming,
    restoreTo: standardMainRacingTiming,
  },
  cancellation: "SERVER_ONLY",
} satisfies JsonObject;

const mainRacingTableValues = {
  name: "Main Racing Table",
  fieldSize: MAIN_RACING_HORSES.length,
  minBet: BigInt(100),
  maxBet: BigInt(6000),
  payoutRateBps: 9_000,
  bettingTimeoutSeconds: activeMainRacingTiming.bettingTimeoutSeconds,
  raceIntervalSeconds: activeMainRacingTiming.raceIntervalSeconds,
  bettingCloseBeforeStartSeconds:
    activeMainRacingTiming.bettingCloseBeforeStartSeconds,
  tickIntervalMs: 100,
  raceDistanceM: 1200,
  roundEndDelaySeconds: 17,
  rules: mainRacingRules,
};

export async function ensureMainRacingSeed(): Promise<MainRacingSeedResult> {
  return db.transaction(async (tx) => {
    const table = await ensureMainRacingTable(tx);
    const horses = [];

    for (const horse of MAIN_RACING_HORSES) {
      horses.push(await ensureRacingHorse(tx, horse));
    }

    return {
      table,
      horses,
    };
  });
}

export async function getRacingTableByCode(tableCode: string) {
  const normalizedTableCode = tableCode.trim();

  if (!normalizedTableCode) {
    return null;
  }

  const [table] = await db
    .select()
    .from(racingTables)
    .where(eq(racingTables.code, normalizedTableCode))
    .limit(1);

  return table ?? null;
}

export async function listActiveRacingHorses(limit?: number) {
  const query = db
    .select()
    .from(racingHorses)
    .where(eq(racingHorses.isActive, true))
    .orderBy(asc(racingHorses.createdAt), asc(racingHorses.name));

  if (limit === undefined) {
    return query;
  }

  return query.limit(limit);
}

async function ensureMainRacingTable(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
) {
  const [existing] = await tx
    .select()
    .from(racingTables)
    .where(eq(racingTables.code, MAIN_RACING_TABLE_CODE))
    .limit(1);

  if (existing) {
    const [updated] = await tx
      .update(racingTables)
      .set({
        ...mainRacingTableValues,
        updatedAt: new Date(),
      })
      .where(eq(racingTables.id, existing.id))
      .returning();

    if (!updated) {
      throw new Error("Failed to update the main racing table.");
    }

    return updated;
  }

  const [table] = await tx
    .insert(racingTables)
    .values({
      code: MAIN_RACING_TABLE_CODE,
      ...mainRacingTableValues,
    })
    .onConflictDoNothing({ target: racingTables.code })
    .returning();

  if (table) {
    return table;
  }

  const [concurrentTable] = await tx
    .select()
    .from(racingTables)
    .where(eq(racingTables.code, MAIN_RACING_TABLE_CODE))
    .limit(1);

  if (!concurrentTable) {
    throw new Error("Failed to create the main racing table.");
  }

  return concurrentTable;
}

async function ensureRacingHorse(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  seed: (typeof MAIN_RACING_HORSES)[number],
) {
  const [existing] = await tx
    .select()
    .from(racingHorses)
    .where(eq(racingHorses.name, seed.name))
    .limit(1);

  if (existing) {
    const [updated] = await tx
      .update(racingHorses)
      .set({
        silkColor: seed.silkColor,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(racingHorses.id, existing.id))
      .returning();

    if (!updated) {
      throw new Error(`Failed to update racing horse ${seed.name}.`);
    }

    return updated;
  }

  const [horse] = await tx
    .insert(racingHorses)
    .values({
      name: seed.name,
      silkColor: seed.silkColor,
      isActive: true,
    })
    .returning();

  if (!horse) {
    throw new Error(`Failed to create racing horse ${seed.name}.`);
  }

  return horse;
}
