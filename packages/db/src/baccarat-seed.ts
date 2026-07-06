import { eq } from "drizzle-orm";

import { db } from "./client.js";
import { baccaratTables, type JsonObject } from "./schema.js";

export const MAIN_BACCARAT_TABLE_CODE = "main";

export type MainBaccaratSeedResult = {
  table: typeof baccaratTables.$inferSelect;
};

const mainBaccaratRoadmapConfig = {
  beadPlate: {
    enabled: true,
    rows: 6,
  },
  basicBigRoad: {
    enabled: true,
    rows: 6,
    leadingTies: "SEPARATE_MARKERS",
  },
  advancedRoadmaps: {
    enabled: false,
  },
} satisfies JsonObject;

const mainBaccaratRules = {
  betTypes: ["PLAYER", "BANKER", "TIE"],
  betGroups: ["MAIN"],
  maxMainBetsPerUserPerRound: 1,
  acceptedBetCancellation: false,
  acceptedBetModification: false,
  deckCount: 8,
  shoePenetrationPercent: 75,
  minimumCardsBeforeRound: 6,
  hiddenCardsStayHiddenUntilReveal: true,
  squeezeChangesResult: false,
  revealOrder: [
    "PLAYER_CARD_1",
    "BANKER_CARD_1",
    "PLAYER_CARD_2",
    "BANKER_CARD_2",
    "PLAYER_CARD_3",
    "BANKER_CARD_3",
  ],
  roadmaps: {
    beadPlate: true,
    basicBigRoad: true,
    advancedRoadmaps: false,
  },
} satisfies JsonObject;

const mainBaccaratTableValues = {
  name: "Main Baccarat Table",
  status: "OPEN",
  minBet: BigInt(100),
  maxMainBet: BigInt(6000),
  maxTotalBetPerUser: BigInt(6000),
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
  roadmapConfig: mainBaccaratRoadmapConfig,
  rules: mainBaccaratRules,
};

export async function ensureMainBaccaratSeed(): Promise<MainBaccaratSeedResult> {
  const table = await ensureMainBaccaratTable();

  return {
    table,
  };
}

export async function getBaccaratTableByCode(tableCode: string) {
  const normalizedTableCode = tableCode.trim();

  if (!normalizedTableCode) {
    return null;
  }

  const [table] = await db
    .select()
    .from(baccaratTables)
    .where(eq(baccaratTables.code, normalizedTableCode))
    .limit(1);

  return table ?? null;
}

async function ensureMainBaccaratTable() {
  const [existing] = await db
    .select()
    .from(baccaratTables)
    .where(eq(baccaratTables.code, MAIN_BACCARAT_TABLE_CODE))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(baccaratTables)
      .set({
        ...mainBaccaratTableValues,
        updatedAt: new Date(),
      })
      .where(eq(baccaratTables.id, existing.id))
      .returning();

    if (!updated) {
      throw new Error("Failed to update the main baccarat table.");
    }

    return updated;
  }

  const [table] = await db
    .insert(baccaratTables)
    .values({
      code: MAIN_BACCARAT_TABLE_CODE,
      ...mainBaccaratTableValues,
    })
    .onConflictDoNothing({ target: baccaratTables.code })
    .returning();

  if (table) {
    return table;
  }

  const [concurrentTable] = await db
    .select()
    .from(baccaratTables)
    .where(eq(baccaratTables.code, MAIN_BACCARAT_TABLE_CODE))
    .limit(1);

  if (!concurrentTable) {
    throw new Error("Failed to create the main baccarat table.");
  }

  return concurrentTable;
}
