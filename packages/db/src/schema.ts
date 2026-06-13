import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export type JsonObject = Record<string, unknown>;

export type CardSnapshot = {
  rank:
    | "A"
    | "2"
    | "3"
    | "4"
    | "5"
    | "6"
    | "7"
    | "8"
    | "9"
    | "10"
    | "J"
    | "Q"
    | "K";
  suit: "clubs" | "diamonds" | "hearts" | "spades";
  hidden?: boolean;
};

export type BlackjackRuleSnapshot = {
  deckCount: number;
  dealerHitsSoft17: boolean;
  blackjackPayout: {
    numerator: number;
    denominator: number;
  };
  insuranceAllowed: boolean;
  evenMoneyAllowed: boolean;
  surrenderMode: "NONE" | "LATE" | "EARLY";
  doubleAllowed: boolean;
  doubleAfterSplitAllowed: boolean;
  splitAllowed: boolean;
  allowTenValueSplit: boolean;
  maxSplitHands: number;
  resplitAcesAllowed: boolean;
  hitSplitAcesAllowed: boolean;
  dealerPeekEnabled: boolean;
  cardCountingMode: "DISABLED" | "INTERNAL_ANALYTICS" | "TRAINER_VISIBLE";
};

const now = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
const pointAmount = (name: string) => bigint(name, { mode: "bigint" });
const emptyJsonObject = sql`'{}'::jsonb`;
const emptyJsonArray = sql`'[]'::jsonb`;

export const authUsers = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: now(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("user_email_unique").on(table.email),
    index("user_created_at_idx").on(table.createdAt),
  ],
);

export const authSessions = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: now(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("session_token_unique").on(table.token),
    index("session_user_id_idx").on(table.userId),
    index("session_expires_at_idx").on(table.expiresAt),
  ],
);

export const authAccounts = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: now(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("account_provider_account_unique").on(
      table.providerId,
      table.accountId,
    ),
    index("account_user_id_idx").on(table.userId),
  ],
);

export const authVerifications = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: now(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("verification_identifier_idx").on(table.identifier),
    index("verification_expires_at_idx").on(table.expiresAt),
  ],
);

export const user = authUsers;
export const session = authSessions;
export const account = authAccounts;
export const verification = authVerifications;

export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => authUsers.id),
    role: text("role").default("PLAYER").notNull(),
    displayName: text("display_name"),
    status: text("status").default("ACTIVE").notNull(),
    createdAt: now(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("user_profiles_status_idx").on(table.status),
    check(
      "user_profiles_role_check",
      sql`${table.role} in ('PLAYER', 'ADMIN')`,
    ),
    check(
      "user_profiles_status_check",
      sql`${table.status} in ('ACTIVE', 'SUSPENDED', 'CLOSED')`,
    ),
  ],
);

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id),
    balance: pointAmount("balance")
      .default(sql`0`)
      .notNull(),
    lockedBalance: pointAmount("locked_balance")
      .default(sql`0`)
      .notNull(),
    status: text("status").default("ACTIVE").notNull(),
    version: integer("version").default(0).notNull(),
    createdAt: now(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("wallets_user_id_unique").on(table.userId),
    index("wallets_status_idx").on(table.status),
    check("wallets_balance_non_negative", sql`${table.balance} >= 0`),
    check(
      "wallets_locked_balance_non_negative",
      sql`${table.lockedBalance} >= 0`,
    ),
    check(
      "wallets_locked_balance_lte_balance",
      sql`${table.lockedBalance} <= ${table.balance}`,
    ),
    check("wallets_version_non_negative", sql`${table.version} >= 0`),
    check(
      "wallets_status_check",
      sql`${table.status} in ('ACTIVE', 'LOCKED', 'CLOSED')`,
    ),
  ],
);

export const pointLedgers = pgTable(
  "point_ledgers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id),
    category: text("category").notNull(),
    gameType: text("game_type"),
    type: text("type").notNull(),
    delta: pointAmount("delta").notNull(),
    balanceBefore: pointAmount("balance_before").notNull(),
    balanceAfter: pointAmount("balance_after").notNull(),
    referenceType: text("reference_type").notNull(),
    referenceId: text("reference_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    memo: text("memo"),
    metadata: jsonb("metadata")
      .$type<JsonObject>()
      .default(emptyJsonObject)
      .notNull(),
    createdAt: now(),
  },
  (table) => [
    uniqueIndex("point_ledgers_user_idempotency_unique").on(
      table.userId,
      table.idempotencyKey,
    ),
    index("point_ledgers_wallet_created_idx").on(
      table.walletId,
      table.createdAt,
    ),
    index("point_ledgers_user_created_idx").on(table.userId, table.createdAt),
    index("point_ledgers_reference_idx").on(
      table.referenceType,
      table.referenceId,
    ),
    index("point_ledgers_game_created_idx").on(table.gameType, table.createdAt),
    check(
      "point_ledgers_category_check",
      sql`${table.category} in ('GAME', 'REWARD', 'ADMIN', 'SYSTEM')`,
    ),
    check(
      "point_ledgers_game_type_check",
      sql`${table.gameType} is null or ${table.gameType} in ('BLACKJACK', 'BACCARAT', 'RACING')`,
    ),
    check(
      "point_ledgers_type_check",
      sql`${table.type} in (
        'ADMIN_ADJUST',
        'DAILY_REWARD',
        'BET',
        'DOUBLE_BET',
        'SPLIT_BET',
        'INSURANCE_BET',
        'SURRENDER_REFUND',
        'PAYOUT',
        'PUSH_REFUND',
        'CANCEL_REFUND'
      )`,
    ),
    check(
      "point_ledgers_balance_before_non_negative",
      sql`${table.balanceBefore} >= 0`,
    ),
    check(
      "point_ledgers_balance_after_non_negative",
      sql`${table.balanceAfter} >= 0`,
    ),
    check(
      "point_ledgers_balance_math_check",
      sql`${table.balanceAfter} = ${table.balanceBefore} + ${table.delta}`,
    ),
    check(
      "point_ledgers_game_category_check",
      sql`(
        (${table.category} = 'GAME' and ${table.gameType} is not null) or
        (${table.category} <> 'GAME' and ${table.gameType} is null)
      )`,
    ),
  ],
);

export const dailyRewardClaims = pgTable(
  "daily_reward_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id),
    claimDate: date("claim_date").notNull(),
    amount: pointAmount("amount").notNull(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => pointLedgers.id),
    createdAt: now(),
  },
  (table) => [
    uniqueIndex("daily_reward_claims_user_date_unique").on(
      table.userId,
      table.claimDate,
    ),
    uniqueIndex("daily_reward_claims_ledger_id_unique").on(table.ledgerId),
    index("daily_reward_claims_user_id_idx").on(table.userId),
    check("daily_reward_claims_amount_positive", sql`${table.amount} > 0`),
  ],
);

export const blackjackTables = pgTable(
  "blackjack_tables",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    status: text("status").default("OPEN").notNull(),
    minInitialBet: pointAmount("min_initial_bet").notNull(),
    maxInitialBet: pointAmount("max_initial_bet").notNull(),
    maxTotalBetPerSeat: pointAmount("max_total_bet_per_seat").notNull(),
    maxTotalBetPerUser: pointAmount("max_total_bet_per_user").notNull(),
    maxSeats: integer("max_seats").default(7).notNull(),
    maxSeatsPerUser: integer("max_seats_per_user").default(1).notNull(),
    bettingTimeoutSeconds: integer("betting_timeout_seconds")
      .default(15)
      .notNull(),
    actionTimeoutSeconds: integer("action_timeout_seconds")
      .default(20)
      .notNull(),
    deckCount: integer("deck_count").default(6).notNull(),
    shoePenetrationPercent: integer("shoe_penetration_percent")
      .default(75)
      .notNull(),
    dealerHitsSoft17: boolean("dealer_hits_soft_17").default(false).notNull(),
    blackjackPayoutNumerator: integer("blackjack_payout_numerator")
      .default(3)
      .notNull(),
    blackjackPayoutDenominator: integer("blackjack_payout_denominator")
      .default(2)
      .notNull(),
    insuranceAllowed: boolean("insurance_allowed").default(false).notNull(),
    evenMoneyAllowed: boolean("even_money_allowed").default(false).notNull(),
    surrenderMode: text("surrender_mode").default("LATE").notNull(),
    doubleAllowed: boolean("double_allowed").default(true).notNull(),
    doubleAfterSplitAllowed: boolean("double_after_split_allowed")
      .default(false)
      .notNull(),
    splitAllowed: boolean("split_allowed").default(true).notNull(),
    allowTenValueSplit: boolean("allow_ten_value_split")
      .default(true)
      .notNull(),
    maxSplitHands: integer("max_split_hands").default(4).notNull(),
    resplitAcesAllowed: boolean("resplit_aces_allowed")
      .default(false)
      .notNull(),
    hitSplitAcesAllowed: boolean("hit_split_aces_allowed")
      .default(false)
      .notNull(),
    dealerPeekEnabled: boolean("dealer_peek_enabled").default(true).notNull(),
    cardCountingMode: text("card_counting_mode")
      .default("INTERNAL_ANALYTICS")
      .notNull(),
    rules: jsonb("rules")
      .$type<JsonObject>()
      .default(emptyJsonObject)
      .notNull(),
    createdAt: now(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("blackjack_tables_code_unique").on(table.code),
    index("blackjack_tables_status_idx").on(table.status),
    check(
      "blackjack_tables_code_not_empty",
      sql`length(trim(${table.code})) > 0`,
    ),
    check(
      "blackjack_tables_status_check",
      sql`${table.status} in ('OPEN', 'MAINTENANCE', 'CLOSED')`,
    ),
    check("blackjack_tables_min_bet_positive", sql`${table.minInitialBet} > 0`),
    check(
      "blackjack_tables_max_initial_bet_check",
      sql`${table.maxInitialBet} >= ${table.minInitialBet}`,
    ),
    check(
      "blackjack_tables_max_total_seat_check",
      sql`${table.maxTotalBetPerSeat} >= ${table.maxInitialBet}`,
    ),
    check(
      "blackjack_tables_max_total_user_check",
      sql`${table.maxTotalBetPerUser} >= ${table.maxTotalBetPerSeat}`,
    ),
    check(
      "blackjack_tables_max_seats_check",
      sql`${table.maxSeats} between 1 and 7`,
    ),
    check(
      "blackjack_tables_max_seats_per_user_check",
      sql`${table.maxSeatsPerUser} between 1 and ${table.maxSeats}`,
    ),
    check(
      "blackjack_tables_betting_timeout_check",
      sql`${table.bettingTimeoutSeconds} > 0`,
    ),
    check(
      "blackjack_tables_action_timeout_check",
      sql`${table.actionTimeoutSeconds} > 0`,
    ),
    check(
      "blackjack_tables_deck_count_check",
      sql`${table.deckCount} between 1 and 8`,
    ),
    check(
      "blackjack_tables_shoe_penetration_check",
      sql`${table.shoePenetrationPercent} between 50 and 90`,
    ),
    check(
      "blackjack_tables_blackjack_payout_check",
      sql`${table.blackjackPayoutNumerator} > ${table.blackjackPayoutDenominator}`,
    ),
    check(
      "blackjack_tables_surrender_mode_check",
      sql`${table.surrenderMode} in ('NONE', 'LATE', 'EARLY')`,
    ),
    check(
      "blackjack_tables_max_split_hands_check",
      sql`${table.maxSplitHands} between 1 and 4`,
    ),
    check(
      "blackjack_tables_counting_mode_check",
      sql`${table.cardCountingMode} in ('DISABLED', 'INTERNAL_ANALYTICS', 'TRAINER_VISIBLE')`,
    ),
  ],
);

export const blackjackTableSeats = pgTable(
  "blackjack_table_seats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => blackjackTables.id),
    seatNo: integer("seat_no").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id),
    status: text("status").default("OCCUPIED").notNull(),
    occupiedAt: timestamp("occupied_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("blackjack_table_seats_table_seat_unique").on(
      table.tableId,
      table.seatNo,
    ),
    index("blackjack_table_seats_table_user_idx").on(
      table.tableId,
      table.userId,
    ),
    index("blackjack_table_seats_user_id_idx").on(table.userId),
    check(
      "blackjack_table_seats_seat_no_check",
      sql`${table.seatNo} between 1 and 7`,
    ),
    check(
      "blackjack_table_seats_status_check",
      sql`${table.status} in ('OCCUPIED', 'SITTING_OUT')`,
    ),
  ],
);

export const blackjackShoes = pgTable(
  "blackjack_shoes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => blackjackTables.id),
    status: text("status").default("READY").notNull(),
    deckCount: integer("deck_count").notNull(),
    cardsTotal: integer("cards_total").notNull(),
    cardsDealt: integer("cards_dealt").default(0).notNull(),
    cutCardPosition: integer("cut_card_position").notNull(),
    runningCount: integer("running_count").default(0).notNull(),
    trueCountX100: integer("true_count_x100").default(0).notNull(),
    shuffleAlgorithm: text("shuffle_algorithm")
      .default("FISHER_YATES_V1")
      .notNull(),
    serverSeedHash: text("server_seed_hash").notNull(),
    encryptedState: text("encrypted_state"),
    stateVersion: integer("state_version").default(0).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: now(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("blackjack_shoes_table_status_idx").on(table.tableId, table.status),
    check(
      "blackjack_shoes_status_check",
      sql`${table.status} in ('READY', 'ACTIVE', 'COMPLETED', 'VOID')`,
    ),
    check(
      "blackjack_shoes_deck_count_check",
      sql`${table.deckCount} between 1 and 8`,
    ),
    check(
      "blackjack_shoes_cards_total_check",
      sql`${table.cardsTotal} = ${table.deckCount} * 52`,
    ),
    check(
      "blackjack_shoes_cards_dealt_check",
      sql`${table.cardsDealt} between 0 and ${table.cardsTotal}`,
    ),
    check(
      "blackjack_shoes_cut_card_position_check",
      sql`${table.cutCardPosition} between 1 and ${table.cardsTotal}`,
    ),
    check(
      "blackjack_shoes_state_version_check",
      sql`${table.stateVersion} >= 0`,
    ),
  ],
);

export const blackjackRounds = pgTable(
  "blackjack_rounds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => blackjackTables.id),
    shoeId: uuid("shoe_id")
      .notNull()
      .references(() => blackjackShoes.id),
    roundNo: integer("round_no").notNull(),
    status: text("status").default("WAITING_BETS").notNull(),
    dealerCards: jsonb("dealer_cards")
      .$type<CardSnapshot[]>()
      .default(emptyJsonArray)
      .notNull(),
    dealerFinalValue: integer("dealer_final_value"),
    dealerHasBlackjack: boolean("dealer_has_blackjack")
      .default(false)
      .notNull(),
    dealerBusted: boolean("dealer_busted").default(false).notNull(),
    runningCountBefore: integer("running_count_before").default(0).notNull(),
    runningCountAfter: integer("running_count_after"),
    trueCountX100Before: integer("true_count_x100_before").default(0).notNull(),
    trueCountX100After: integer("true_count_x100_after"),
    ruleSnapshot: jsonb("rule_snapshot")
      .$type<BlackjackRuleSnapshot>()
      .notNull(),
    bettingOpensAt: timestamp("betting_opens_at", { withTimezone: true }),
    bettingClosesAt: timestamp("betting_closes_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: now(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("blackjack_rounds_table_round_no_unique").on(
      table.tableId,
      table.roundNo,
    ),
    index("blackjack_rounds_table_status_idx").on(table.tableId, table.status),
    index("blackjack_rounds_shoe_id_idx").on(table.shoeId),
    check(
      "blackjack_rounds_status_check",
      sql`${table.status} in (
        'WAITING_BETS',
        'DEALING',
        'PLAYER_TURNS',
        'DEALER_TURN',
        'SETTLING',
        'SETTLED',
        'CANCELLED'
      )`,
    ),
    check(
      "blackjack_rounds_dealer_final_value_check",
      sql`${table.dealerFinalValue} is null or ${table.dealerFinalValue} between 0 and 31`,
    ),
  ],
);

export const blackjackRoundSeats = pgTable(
  "blackjack_round_seats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => blackjackRounds.id),
    tableId: uuid("table_id")
      .notNull()
      .references(() => blackjackTables.id),
    seatNo: integer("seat_no").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id),
    status: text("status").default("ACTIVE").notNull(),
    initialBetAmount: pointAmount("initial_bet_amount").notNull(),
    totalWagerAmount: pointAmount("total_wager_amount").notNull(),
    totalPayoutAmount: pointAmount("total_payout_amount")
      .default(sql`0`)
      .notNull(),
    netAmount: pointAmount("net_amount")
      .default(sql`0`)
      .notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: now(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("blackjack_round_seats_round_seat_unique").on(
      table.roundId,
      table.seatNo,
    ),
    index("blackjack_round_seats_round_user_idx").on(
      table.roundId,
      table.userId,
    ),
    index("blackjack_round_seats_table_user_idx").on(
      table.tableId,
      table.userId,
    ),
    check(
      "blackjack_round_seats_seat_no_check",
      sql`${table.seatNo} between 1 and 7`,
    ),
    check(
      "blackjack_round_seats_initial_bet_positive",
      sql`${table.initialBetAmount} > 0`,
    ),
    check(
      "blackjack_round_seats_total_wager_check",
      sql`${table.totalWagerAmount} >= ${table.initialBetAmount}`,
    ),
    check(
      "blackjack_round_seats_total_payout_non_negative",
      sql`${table.totalPayoutAmount} >= 0`,
    ),
    check(
      "blackjack_round_seats_status_check",
      sql`${table.status} in ('ACTIVE', 'SETTLED', 'CANCELLED')`,
    ),
  ],
);

export const blackjackHands = pgTable(
  "blackjack_hands",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => blackjackRounds.id),
    roundSeatId: uuid("round_seat_id")
      .notNull()
      .references(() => blackjackRoundSeats.id),
    handNo: integer("hand_no").notNull(),
    sourceHandId: uuid("source_hand_id"),
    status: text("status").default("ACTIVE").notNull(),
    cards: jsonb("cards")
      .$type<CardSnapshot[]>()
      .default(emptyJsonArray)
      .notNull(),
    initialBetAmount: pointAmount("initial_bet_amount").notNull(),
    finalBetAmount: pointAmount("final_bet_amount").notNull(),
    payoutAmount: pointAmount("payout_amount")
      .default(sql`0`)
      .notNull(),
    netAmount: pointAmount("net_amount")
      .default(sql`0`)
      .notNull(),
    outcome: text("outcome"),
    outcomeReason: text("outcome_reason"),
    handValue: integer("hand_value"),
    isSoft: boolean("is_soft").default(false).notNull(),
    isNaturalBlackjack: boolean("is_natural_blackjack")
      .default(false)
      .notNull(),
    isSplitHand: boolean("is_split_hand").default(false).notNull(),
    isDoubled: boolean("is_doubled").default(false).notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: now(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("blackjack_hands_round_seat_hand_unique").on(
      table.roundSeatId,
      table.handNo,
    ),
    index("blackjack_hands_round_id_idx").on(table.roundId),
    index("blackjack_hands_round_seat_id_idx").on(table.roundSeatId),
    index("blackjack_hands_source_hand_id_idx").on(table.sourceHandId),
    check(
      "blackjack_hands_hand_no_check",
      sql`${table.handNo} between 1 and 4`,
    ),
    check(
      "blackjack_hands_initial_bet_positive",
      sql`${table.initialBetAmount} > 0`,
    ),
    check(
      "blackjack_hands_final_bet_check",
      sql`${table.finalBetAmount} >= ${table.initialBetAmount}`,
    ),
    check(
      "blackjack_hands_payout_non_negative",
      sql`${table.payoutAmount} >= 0`,
    ),
    check(
      "blackjack_hands_status_check",
      sql`${table.status} in ('ACTIVE', 'STOOD', 'DOUBLED', 'SURRENDERED', 'BUSTED', 'SETTLED', 'CANCELLED')`,
    ),
    check(
      "blackjack_hands_outcome_check",
      sql`${table.outcome} is null or ${table.outcome} in ('WIN', 'LOSE', 'PUSH', 'CANCELLED')`,
    ),
    check(
      "blackjack_hands_outcome_reason_check",
      sql`${table.outcomeReason} is null or ${table.outcomeReason} in (
        'NATURAL_BLACKJACK',
        'STANDARD',
        'PLAYER_BUST',
        'DEALER_BUST',
        'SURRENDER',
        'DEALER_BLACKJACK',
        'ROUND_CANCELLED'
      )`,
    ),
    check(
      "blackjack_hands_value_check",
      sql`${table.handValue} is null or ${table.handValue} between 0 and 31`,
    ),
  ],
);

export const blackjackSideBets = pgTable(
  "blackjack_side_bets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => blackjackRounds.id),
    roundSeatId: uuid("round_seat_id")
      .notNull()
      .references(() => blackjackRoundSeats.id),
    type: text("type").notNull(),
    status: text("status").default("PLACED").notNull(),
    amount: pointAmount("amount").notNull(),
    payoutAmount: pointAmount("payout_amount")
      .default(sql`0`)
      .notNull(),
    netAmount: pointAmount("net_amount")
      .default(sql`0`)
      .notNull(),
    outcome: text("outcome"),
    outcomeReason: text("outcome_reason"),
    createdAt: now(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("blackjack_side_bets_round_seat_type_unique").on(
      table.roundSeatId,
      table.type,
    ),
    index("blackjack_side_bets_round_id_idx").on(table.roundId),
    index("blackjack_side_bets_round_seat_id_idx").on(table.roundSeatId),
    check(
      "blackjack_side_bets_type_check",
      sql`${table.type} in ('INSURANCE')`,
    ),
    check(
      "blackjack_side_bets_status_check",
      sql`${table.status} in ('PLACED', 'SETTLED', 'CANCELLED')`,
    ),
    check("blackjack_side_bets_amount_positive", sql`${table.amount} > 0`),
    check(
      "blackjack_side_bets_payout_non_negative",
      sql`${table.payoutAmount} >= 0`,
    ),
    check(
      "blackjack_side_bets_outcome_check",
      sql`${table.outcome} is null or ${table.outcome} in ('WIN', 'LOSE', 'CANCELLED')`,
    ),
    check(
      "blackjack_side_bets_reason_check",
      sql`${table.outcomeReason} is null or ${table.outcomeReason} in ('DEALER_BLACKJACK', 'DEALER_NO_BLACKJACK', 'ROUND_CANCELLED')`,
    ),
  ],
);

export const blackjackActions = pgTable(
  "blackjack_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => blackjackRounds.id),
    roundSeatId: uuid("round_seat_id").references(() => blackjackRoundSeats.id),
    handId: uuid("hand_id").references(() => blackjackHands.id),
    userId: text("user_id").references(() => authUsers.id),
    actorType: text("actor_type").notNull(),
    actionType: text("action_type").notNull(),
    actionSequence: integer("action_sequence").notNull(),
    commandId: text("command_id"),
    amount: pointAmount("amount"),
    payload: jsonb("payload")
      .$type<JsonObject>()
      .default(emptyJsonObject)
      .notNull(),
    createdAt: now(),
  },
  (table) => [
    uniqueIndex("blackjack_actions_round_sequence_unique").on(
      table.roundId,
      table.actionSequence,
    ),
    uniqueIndex("blackjack_actions_round_command_unique")
      .on(table.roundId, table.commandId)
      .where(sql`${table.commandId} is not null`),
    index("blackjack_actions_round_id_idx").on(table.roundId),
    index("blackjack_actions_round_seat_id_idx").on(table.roundSeatId),
    index("blackjack_actions_hand_id_idx").on(table.handId),
    index("blackjack_actions_user_id_idx").on(table.userId),
    check(
      "blackjack_actions_sequence_positive",
      sql`${table.actionSequence} > 0`,
    ),
    check(
      "blackjack_actions_amount_non_negative",
      sql`${table.amount} is null or ${table.amount} >= 0`,
    ),
    check(
      "blackjack_actions_actor_type_check",
      sql`${table.actorType} in ('PLAYER', 'DEALER', 'SYSTEM')`,
    ),
    check(
      "blackjack_actions_action_type_check",
      sql`${table.actionType} in (
        'PLACE_BET',
        'DEAL',
        'HIT',
        'STAND',
        'DOUBLE',
        'SPLIT',
        'SURRENDER',
        'INSURANCE_ACCEPT',
        'INSURANCE_DECLINE',
        'EVEN_MONEY',
        'TIMEOUT',
        'AUTO_STAND',
        'SETTLE',
        'CANCEL'
      )`,
    ),
  ],
);

export const racingTables = pgTable(
  "racing_tables",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    status: text("status").default("OPEN").notNull(),
    fieldSize: integer("field_size").default(6).notNull(),
    minBet: pointAmount("min_bet").notNull(),
    maxBet: pointAmount("max_bet").notNull(),
    payoutRateBps: integer("payout_rate_bps").default(9000).notNull(),
    bettingTimeoutSeconds: integer("betting_timeout_seconds")
      .default(20)
      .notNull(),
    tickIntervalMs: integer("tick_interval_ms").default(100).notNull(),
    raceDistanceM: integer("race_distance_m").default(1200).notNull(),
    roundEndDelaySeconds: integer("round_end_delay_seconds")
      .default(8)
      .notNull(),
    rules: jsonb("rules")
      .$type<JsonObject>()
      .default(emptyJsonObject)
      .notNull(),
    createdAt: now(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("racing_tables_code_unique").on(table.code),
    index("racing_tables_status_idx").on(table.status),
    check(
      "racing_tables_code_not_empty",
      sql`length(trim(${table.code})) > 0`,
    ),
    check(
      "racing_tables_status_check",
      sql`${table.status} in ('OPEN', 'MAINTENANCE', 'CLOSED')`,
    ),
    check(
      "racing_tables_field_size_check",
      sql`${table.fieldSize} between 6 and 8`,
    ),
    check("racing_tables_min_bet_positive", sql`${table.minBet} > 0`),
    check(
      "racing_tables_max_bet_check",
      sql`${table.maxBet} >= ${table.minBet}`,
    ),
    check(
      "racing_tables_payout_rate_check",
      sql`${table.payoutRateBps} between 1 and 10000`,
    ),
    check(
      "racing_tables_betting_timeout_check",
      sql`${table.bettingTimeoutSeconds} > 0`,
    ),
    check(
      "racing_tables_tick_interval_check",
      sql`${table.tickIntervalMs} > 0`,
    ),
    check(
      "racing_tables_distance_check",
      sql`${table.raceDistanceM} > 0`,
    ),
    check(
      "racing_tables_round_end_delay_check",
      sql`${table.roundEndDelaySeconds} >= 0`,
    ),
  ],
);

export const racingHorses = pgTable(
  "racing_horses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    silkColor: text("silk_color").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: now(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("racing_horses_active_idx").on(table.isActive),
    check(
      "racing_horses_name_not_empty",
      sql`length(trim(${table.name})) > 0`,
    ),
    check(
      "racing_horses_silk_color_not_empty",
      sql`length(trim(${table.silkColor})) > 0`,
    ),
  ],
);

export const racingRaces = pgTable(
  "racing_races",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => racingTables.id),
    raceNo: integer("race_no").notNull(),
    status: text("status").default("BETTING").notNull(),
    seed: text("seed"),
    seedLockedAt: timestamp("seed_locked_at", { withTimezone: true }),
    distanceM: integer("distance_m").notNull(),
    fieldSize: integer("field_size").notNull(),
    phase: text("phase").default("BETTING").notNull(),
    bettingOpensAt: timestamp("betting_opens_at", { withTimezone: true }),
    bettingClosesAt: timestamp("betting_closes_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    resultOrder: jsonb("result_order")
      .$type<string[]>()
      .default(emptyJsonArray)
      .notNull(),
    runtimeSnapshot: jsonb("runtime_snapshot").$type<JsonObject>(),
    createdAt: now(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("racing_races_table_id_id_unique").on(table.tableId, table.id),
    uniqueIndex("racing_races_table_race_no_unique").on(
      table.tableId,
      table.raceNo,
    ),
    index("racing_races_table_status_idx").on(table.tableId, table.status),
    index("racing_races_table_phase_idx").on(table.tableId, table.phase),
    check("racing_races_race_no_positive", sql`${table.raceNo} > 0`),
    check(
      "racing_races_status_check",
      sql`${table.status} in (
        'BETTING',
        'LOCKING_BETS',
        'RUNNING',
        'FINISHING',
        'SETTLING',
        'SETTLED',
        'ROUND_END',
        'CANCELLED'
      )`,
    ),
    check(
      "racing_races_phase_check",
      sql`${table.phase} in (
        'BETTING',
        'LOCKING_BETS',
        'RUNNING',
        'FINISHING',
        'SETTLING',
        'SETTLED',
        'ROUND_END',
        'CANCELLED'
      )`,
    ),
    check(
      "racing_races_seed_lock_check",
      sql`(
        (${table.seed} is null and ${table.seedLockedAt} is null) or
        (${table.seed} is not null and ${table.seedLockedAt} is not null)
      )`,
    ),
    check(
      "racing_races_seed_after_betting_check",
      sql`(
        ${table.phase} <> 'BETTING' or
        (${table.seed} is null and ${table.seedLockedAt} is null)
      )`,
    ),
    check(
      "racing_races_distance_positive",
      sql`${table.distanceM} > 0`,
    ),
    check(
      "racing_races_field_size_check",
      sql`${table.fieldSize} between 6 and 8`,
    ),
  ],
);

export const racingRaceEntries = pgTable(
  "racing_race_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    raceId: uuid("race_id")
      .notNull()
      .references(() => racingRaces.id),
    horseId: uuid("horse_id")
      .notNull()
      .references(() => racingHorses.id),
    number: integer("number").notNull(),
    gateNo: integer("gate_no").notNull(),
    lane: integer("lane").notNull(),
    temporaryProfile: jsonb("temporary_profile").$type<JsonObject>(),
    finalRank: integer("final_rank"),
    finishedAtMs: integer("finished_at_ms"),
    createdAt: now(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("racing_entries_race_id_id_horse_id_unique").on(
      table.raceId,
      table.id,
      table.horseId,
    ),
    uniqueIndex("racing_entries_race_horse_unique").on(
      table.raceId,
      table.horseId,
    ),
    uniqueIndex("racing_entries_race_number_unique").on(
      table.raceId,
      table.number,
    ),
    uniqueIndex("racing_entries_race_gate_unique").on(
      table.raceId,
      table.gateNo,
    ),
    index("racing_entries_race_id_idx").on(table.raceId),
    index("racing_entries_horse_id_idx").on(table.horseId),
    check("racing_entries_number_positive", sql`${table.number} > 0`),
    check("racing_entries_gate_no_positive", sql`${table.gateNo} > 0`),
    check("racing_entries_lane_positive", sql`${table.lane} > 0`),
    check(
      "racing_entries_final_rank_positive",
      sql`${table.finalRank} is null or ${table.finalRank} > 0`,
    ),
    check(
      "racing_entries_finished_at_non_negative",
      sql`${table.finishedAtMs} is null or ${table.finishedAtMs} >= 0`,
    ),
  ],
);

export const racingBets = pgTable(
  "racing_bets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    raceId: uuid("race_id").notNull(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => racingTables.id),
    raceEntryId: uuid("race_entry_id").notNull(),
    horseId: uuid("horse_id")
      .notNull()
      .references(() => racingHorses.id),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id),
    betType: text("bet_type").default("WIN").notNull(),
    status: text("status").default("PLACED").notNull(),
    amount: pointAmount("amount").notNull(),
    oddsNumerator: integer("odds_numerator").notNull(),
    oddsDenominator: integer("odds_denominator").notNull(),
    payoutAmount: pointAmount("payout_amount")
      .default(sql`0`)
      .notNull(),
    netAmount: pointAmount("net_amount")
      .default(sql`0`)
      .notNull(),
    placedLedgerId: uuid("placed_ledger_id")
      .notNull()
      .references(() => pointLedgers.id),
    settlementLedgerId: uuid("settlement_ledger_id").references(
      () => pointLedgers.id,
    ),
    commandId: text("command_id").notNull(),
    createdAt: now(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "racing_bets_race_table_fk",
      columns: [table.tableId, table.raceId],
      foreignColumns: [racingRaces.tableId, racingRaces.id],
    }),
    foreignKey({
      name: "racing_bets_race_entry_fk",
      columns: [table.raceId, table.raceEntryId, table.horseId],
      foreignColumns: [
        racingRaceEntries.raceId,
        racingRaceEntries.id,
        racingRaceEntries.horseId,
      ],
    }),
    uniqueIndex("racing_bets_race_user_unique").on(table.raceId, table.userId),
    uniqueIndex("racing_bets_race_user_command_unique").on(
      table.raceId,
      table.userId,
      table.commandId,
    ),
    uniqueIndex("racing_bets_placed_ledger_unique").on(table.placedLedgerId),
    uniqueIndex("racing_bets_settlement_ledger_unique")
      .on(table.settlementLedgerId)
      .where(sql`${table.settlementLedgerId} is not null`),
    index("racing_bets_race_id_idx").on(table.raceId),
    index("racing_bets_table_id_idx").on(table.tableId),
    index("racing_bets_race_entry_id_idx").on(table.raceEntryId),
    index("racing_bets_user_id_idx").on(table.userId),
    check("racing_bets_amount_positive", sql`${table.amount} > 0`),
    check(
      "racing_bets_type_check",
      sql`${table.betType} in ('WIN')`,
    ),
    check(
      "racing_bets_status_check",
      sql`${table.status} in ('PLACED', 'WON', 'LOST', 'CANCELLED')`,
    ),
    check(
      "racing_bets_odds_positive",
      sql`${table.oddsNumerator} > 0 and ${table.oddsDenominator} > 0`,
    ),
    check(
      "racing_bets_payout_non_negative",
      sql`${table.payoutAmount} >= 0`,
    ),
  ],
);

export const racingTicks = pgTable(
  "racing_ticks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    raceId: uuid("race_id")
      .notNull()
      .references(() => racingRaces.id),
    tick: integer("tick").notNull(),
    elapsedMs: integer("elapsed_ms").notNull(),
    state: jsonb("state").$type<JsonObject>().notNull(),
    createdAt: now(),
  },
  (table) => [
    uniqueIndex("racing_ticks_race_tick_unique").on(table.raceId, table.tick),
    index("racing_ticks_race_id_idx").on(table.raceId),
    check("racing_ticks_tick_non_negative", sql`${table.tick} >= 0`),
    check("racing_ticks_elapsed_non_negative", sql`${table.elapsedMs} >= 0`),
  ],
);

export const racingActions = pgTable(
  "racing_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    raceId: uuid("race_id")
      .notNull()
      .references(() => racingRaces.id),
    betId: uuid("bet_id").references(() => racingBets.id),
    userId: text("user_id").references(() => authUsers.id),
    actorType: text("actor_type").notNull(),
    actionType: text("action_type").notNull(),
    actionSequence: integer("action_sequence").notNull(),
    commandId: text("command_id"),
    amount: pointAmount("amount"),
    payload: jsonb("payload")
      .$type<JsonObject>()
      .default(emptyJsonObject)
      .notNull(),
    createdAt: now(),
  },
  (table) => [
    uniqueIndex("racing_actions_race_sequence_unique").on(
      table.raceId,
      table.actionSequence,
    ),
    uniqueIndex("racing_actions_race_user_command_unique")
      .on(table.raceId, table.userId, table.commandId)
      .where(
        sql`${table.userId} is not null and ${table.commandId} is not null`,
      ),
    index("racing_actions_race_id_idx").on(table.raceId),
    index("racing_actions_bet_id_idx").on(table.betId),
    index("racing_actions_user_id_idx").on(table.userId),
    check(
      "racing_actions_sequence_positive",
      sql`${table.actionSequence} > 0`,
    ),
    check(
      "racing_actions_actor_type_check",
      sql`${table.actorType} in ('PLAYER', 'SYSTEM')`,
    ),
    check(
      "racing_actions_action_type_check",
      sql`${table.actionType} in (
        'PLACE_BET',
        'RACE_START',
        'FINISH',
        'SETTLE',
        'CANCEL'
      )`,
    ),
    check(
      "racing_actions_amount_non_negative",
      sql`${table.amount} is null or ${table.amount} >= 0`,
    ),
  ],
);

export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: text("actor_user_id").references(() => authUsers.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    before: jsonb("before").$type<JsonObject>(),
    after: jsonb("after").$type<JsonObject>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: now(),
  },
  (table) => [
    index("admin_audit_logs_actor_created_idx").on(
      table.actorUserId,
      table.createdAt,
    ),
    index("admin_audit_logs_target_idx").on(table.targetType, table.targetId),
  ],
);

export const schemaVersion = "blackjack-professional-v1";
