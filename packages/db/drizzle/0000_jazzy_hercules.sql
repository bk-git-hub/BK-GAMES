CREATE TABLE "admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blackjack_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"round_seat_id" uuid,
	"hand_id" uuid,
	"user_id" text,
	"actor_type" text NOT NULL,
	"action_type" text NOT NULL,
	"action_sequence" integer NOT NULL,
	"command_id" text,
	"amount" bigint,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blackjack_actions_sequence_positive" CHECK ("blackjack_actions"."action_sequence" > 0),
	CONSTRAINT "blackjack_actions_amount_non_negative" CHECK ("blackjack_actions"."amount" is null or "blackjack_actions"."amount" >= 0),
	CONSTRAINT "blackjack_actions_actor_type_check" CHECK ("blackjack_actions"."actor_type" in ('PLAYER', 'DEALER', 'SYSTEM')),
	CONSTRAINT "blackjack_actions_action_type_check" CHECK ("blackjack_actions"."action_type" in (
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
      ))
);
--> statement-breakpoint
CREATE TABLE "blackjack_hands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"round_seat_id" uuid NOT NULL,
	"hand_no" integer NOT NULL,
	"source_hand_id" uuid,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"cards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"initial_bet_amount" bigint NOT NULL,
	"final_bet_amount" bigint NOT NULL,
	"payout_amount" bigint DEFAULT 0 NOT NULL,
	"net_amount" bigint DEFAULT 0 NOT NULL,
	"outcome" text,
	"outcome_reason" text,
	"hand_value" integer,
	"is_soft" boolean DEFAULT false NOT NULL,
	"is_natural_blackjack" boolean DEFAULT false NOT NULL,
	"is_split_hand" boolean DEFAULT false NOT NULL,
	"is_doubled" boolean DEFAULT false NOT NULL,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blackjack_hands_hand_no_check" CHECK ("blackjack_hands"."hand_no" between 1 and 4),
	CONSTRAINT "blackjack_hands_initial_bet_positive" CHECK ("blackjack_hands"."initial_bet_amount" > 0),
	CONSTRAINT "blackjack_hands_final_bet_check" CHECK ("blackjack_hands"."final_bet_amount" >= "blackjack_hands"."initial_bet_amount"),
	CONSTRAINT "blackjack_hands_payout_non_negative" CHECK ("blackjack_hands"."payout_amount" >= 0),
	CONSTRAINT "blackjack_hands_status_check" CHECK ("blackjack_hands"."status" in ('ACTIVE', 'STOOD', 'DOUBLED', 'SURRENDERED', 'BUSTED', 'SETTLED', 'CANCELLED')),
	CONSTRAINT "blackjack_hands_outcome_check" CHECK ("blackjack_hands"."outcome" is null or "blackjack_hands"."outcome" in ('WIN', 'LOSE', 'PUSH', 'CANCELLED')),
	CONSTRAINT "blackjack_hands_outcome_reason_check" CHECK ("blackjack_hands"."outcome_reason" is null or "blackjack_hands"."outcome_reason" in (
        'NATURAL_BLACKJACK',
        'STANDARD',
        'PLAYER_BUST',
        'DEALER_BUST',
        'SURRENDER',
        'DEALER_BLACKJACK',
        'ROUND_CANCELLED'
      )),
	CONSTRAINT "blackjack_hands_value_check" CHECK ("blackjack_hands"."hand_value" is null or "blackjack_hands"."hand_value" between 0 and 31)
);
--> statement-breakpoint
CREATE TABLE "blackjack_round_seats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"seat_no" integer NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"initial_bet_amount" bigint NOT NULL,
	"total_wager_amount" bigint NOT NULL,
	"total_payout_amount" bigint DEFAULT 0 NOT NULL,
	"net_amount" bigint DEFAULT 0 NOT NULL,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blackjack_round_seats_seat_no_check" CHECK ("blackjack_round_seats"."seat_no" between 1 and 7),
	CONSTRAINT "blackjack_round_seats_initial_bet_positive" CHECK ("blackjack_round_seats"."initial_bet_amount" > 0),
	CONSTRAINT "blackjack_round_seats_total_wager_check" CHECK ("blackjack_round_seats"."total_wager_amount" >= "blackjack_round_seats"."initial_bet_amount"),
	CONSTRAINT "blackjack_round_seats_total_payout_non_negative" CHECK ("blackjack_round_seats"."total_payout_amount" >= 0),
	CONSTRAINT "blackjack_round_seats_status_check" CHECK ("blackjack_round_seats"."status" in ('ACTIVE', 'SETTLED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "blackjack_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"shoe_id" uuid NOT NULL,
	"round_no" integer NOT NULL,
	"status" text DEFAULT 'WAITING_BETS' NOT NULL,
	"dealer_cards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dealer_final_value" integer,
	"dealer_has_blackjack" boolean DEFAULT false NOT NULL,
	"dealer_busted" boolean DEFAULT false NOT NULL,
	"running_count_before" integer DEFAULT 0 NOT NULL,
	"running_count_after" integer,
	"true_count_x100_before" integer DEFAULT 0 NOT NULL,
	"true_count_x100_after" integer,
	"rule_snapshot" jsonb NOT NULL,
	"betting_opens_at" timestamp with time zone,
	"betting_closes_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blackjack_rounds_status_check" CHECK ("blackjack_rounds"."status" in (
        'WAITING_BETS',
        'DEALING',
        'PLAYER_TURNS',
        'DEALER_TURN',
        'SETTLING',
        'SETTLED',
        'CANCELLED'
      )),
	CONSTRAINT "blackjack_rounds_dealer_final_value_check" CHECK ("blackjack_rounds"."dealer_final_value" is null or "blackjack_rounds"."dealer_final_value" between 0 and 31)
);
--> statement-breakpoint
CREATE TABLE "blackjack_shoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"status" text DEFAULT 'READY' NOT NULL,
	"deck_count" integer NOT NULL,
	"cards_total" integer NOT NULL,
	"cards_dealt" integer DEFAULT 0 NOT NULL,
	"cut_card_position" integer NOT NULL,
	"running_count" integer DEFAULT 0 NOT NULL,
	"true_count_x100" integer DEFAULT 0 NOT NULL,
	"shuffle_algorithm" text DEFAULT 'FISHER_YATES_V1' NOT NULL,
	"server_seed_hash" text NOT NULL,
	"encrypted_state" text,
	"state_version" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blackjack_shoes_status_check" CHECK ("blackjack_shoes"."status" in ('READY', 'ACTIVE', 'COMPLETED', 'VOID')),
	CONSTRAINT "blackjack_shoes_deck_count_check" CHECK ("blackjack_shoes"."deck_count" between 1 and 8),
	CONSTRAINT "blackjack_shoes_cards_total_check" CHECK ("blackjack_shoes"."cards_total" = "blackjack_shoes"."deck_count" * 52),
	CONSTRAINT "blackjack_shoes_cards_dealt_check" CHECK ("blackjack_shoes"."cards_dealt" between 0 and "blackjack_shoes"."cards_total"),
	CONSTRAINT "blackjack_shoes_cut_card_position_check" CHECK ("blackjack_shoes"."cut_card_position" between 1 and "blackjack_shoes"."cards_total"),
	CONSTRAINT "blackjack_shoes_state_version_check" CHECK ("blackjack_shoes"."state_version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "blackjack_side_bets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"round_seat_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'PLACED' NOT NULL,
	"amount" bigint NOT NULL,
	"payout_amount" bigint DEFAULT 0 NOT NULL,
	"net_amount" bigint DEFAULT 0 NOT NULL,
	"outcome" text,
	"outcome_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "blackjack_side_bets_type_check" CHECK ("blackjack_side_bets"."type" in ('INSURANCE')),
	CONSTRAINT "blackjack_side_bets_status_check" CHECK ("blackjack_side_bets"."status" in ('PLACED', 'SETTLED', 'CANCELLED')),
	CONSTRAINT "blackjack_side_bets_amount_positive" CHECK ("blackjack_side_bets"."amount" > 0),
	CONSTRAINT "blackjack_side_bets_payout_non_negative" CHECK ("blackjack_side_bets"."payout_amount" >= 0),
	CONSTRAINT "blackjack_side_bets_outcome_check" CHECK ("blackjack_side_bets"."outcome" is null or "blackjack_side_bets"."outcome" in ('WIN', 'LOSE', 'CANCELLED')),
	CONSTRAINT "blackjack_side_bets_reason_check" CHECK ("blackjack_side_bets"."outcome_reason" is null or "blackjack_side_bets"."outcome_reason" in ('DEALER_BLACKJACK', 'DEALER_NO_BLACKJACK', 'ROUND_CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "blackjack_table_seats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"seat_no" integer NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'OCCUPIED' NOT NULL,
	"occupied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blackjack_table_seats_seat_no_check" CHECK ("blackjack_table_seats"."seat_no" between 1 and 7),
	CONSTRAINT "blackjack_table_seats_status_check" CHECK ("blackjack_table_seats"."status" in ('OCCUPIED', 'SITTING_OUT'))
);
--> statement-breakpoint
CREATE TABLE "blackjack_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"min_initial_bet" bigint NOT NULL,
	"max_initial_bet" bigint NOT NULL,
	"max_total_bet_per_seat" bigint NOT NULL,
	"max_total_bet_per_user" bigint NOT NULL,
	"max_seats" integer DEFAULT 7 NOT NULL,
	"max_seats_per_user" integer DEFAULT 1 NOT NULL,
	"betting_timeout_seconds" integer DEFAULT 15 NOT NULL,
	"action_timeout_seconds" integer DEFAULT 20 NOT NULL,
	"deck_count" integer DEFAULT 6 NOT NULL,
	"shoe_penetration_percent" integer DEFAULT 75 NOT NULL,
	"dealer_hits_soft_17" boolean DEFAULT false NOT NULL,
	"blackjack_payout_numerator" integer DEFAULT 3 NOT NULL,
	"blackjack_payout_denominator" integer DEFAULT 2 NOT NULL,
	"insurance_allowed" boolean DEFAULT false NOT NULL,
	"even_money_allowed" boolean DEFAULT false NOT NULL,
	"surrender_mode" text DEFAULT 'LATE' NOT NULL,
	"double_allowed" boolean DEFAULT true NOT NULL,
	"double_after_split_allowed" boolean DEFAULT false NOT NULL,
	"split_allowed" boolean DEFAULT true NOT NULL,
	"max_split_hands" integer DEFAULT 4 NOT NULL,
	"resplit_aces_allowed" boolean DEFAULT false NOT NULL,
	"hit_split_aces_allowed" boolean DEFAULT false NOT NULL,
	"dealer_peek_enabled" boolean DEFAULT true NOT NULL,
	"card_counting_mode" text DEFAULT 'INTERNAL_ANALYTICS' NOT NULL,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blackjack_tables_status_check" CHECK ("blackjack_tables"."status" in ('OPEN', 'MAINTENANCE', 'CLOSED')),
	CONSTRAINT "blackjack_tables_min_bet_positive" CHECK ("blackjack_tables"."min_initial_bet" > 0),
	CONSTRAINT "blackjack_tables_max_initial_bet_check" CHECK ("blackjack_tables"."max_initial_bet" >= "blackjack_tables"."min_initial_bet"),
	CONSTRAINT "blackjack_tables_max_total_seat_check" CHECK ("blackjack_tables"."max_total_bet_per_seat" >= "blackjack_tables"."max_initial_bet"),
	CONSTRAINT "blackjack_tables_max_total_user_check" CHECK ("blackjack_tables"."max_total_bet_per_user" >= "blackjack_tables"."max_total_bet_per_seat"),
	CONSTRAINT "blackjack_tables_max_seats_check" CHECK ("blackjack_tables"."max_seats" between 1 and 7),
	CONSTRAINT "blackjack_tables_max_seats_per_user_check" CHECK ("blackjack_tables"."max_seats_per_user" between 1 and "blackjack_tables"."max_seats"),
	CONSTRAINT "blackjack_tables_betting_timeout_check" CHECK ("blackjack_tables"."betting_timeout_seconds" > 0),
	CONSTRAINT "blackjack_tables_action_timeout_check" CHECK ("blackjack_tables"."action_timeout_seconds" > 0),
	CONSTRAINT "blackjack_tables_deck_count_check" CHECK ("blackjack_tables"."deck_count" between 1 and 8),
	CONSTRAINT "blackjack_tables_shoe_penetration_check" CHECK ("blackjack_tables"."shoe_penetration_percent" between 50 and 90),
	CONSTRAINT "blackjack_tables_blackjack_payout_check" CHECK ("blackjack_tables"."blackjack_payout_numerator" > "blackjack_tables"."blackjack_payout_denominator"),
	CONSTRAINT "blackjack_tables_surrender_mode_check" CHECK ("blackjack_tables"."surrender_mode" in ('NONE', 'LATE', 'EARLY')),
	CONSTRAINT "blackjack_tables_max_split_hands_check" CHECK ("blackjack_tables"."max_split_hands" between 1 and 4),
	CONSTRAINT "blackjack_tables_counting_mode_check" CHECK ("blackjack_tables"."card_counting_mode" in ('DISABLED', 'INTERNAL_ANALYTICS', 'TRAINER_VISIBLE'))
);
--> statement-breakpoint
CREATE TABLE "daily_reward_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"claim_date" date NOT NULL,
	"amount" bigint NOT NULL,
	"ledger_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_reward_claims_amount_positive" CHECK ("daily_reward_claims"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "point_ledgers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"game_type" text,
	"type" text NOT NULL,
	"delta" bigint NOT NULL,
	"balance_before" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"memo" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "point_ledgers_category_check" CHECK ("point_ledgers"."category" in ('GAME', 'REWARD', 'ADMIN', 'SYSTEM')),
	CONSTRAINT "point_ledgers_game_type_check" CHECK ("point_ledgers"."game_type" is null or "point_ledgers"."game_type" in ('BLACKJACK', 'BACCARAT')),
	CONSTRAINT "point_ledgers_type_check" CHECK ("point_ledgers"."type" in (
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
      )),
	CONSTRAINT "point_ledgers_balance_before_non_negative" CHECK ("point_ledgers"."balance_before" >= 0),
	CONSTRAINT "point_ledgers_balance_after_non_negative" CHECK ("point_ledgers"."balance_after" >= 0),
	CONSTRAINT "point_ledgers_balance_math_check" CHECK ("point_ledgers"."balance_after" = "point_ledgers"."balance_before" + "point_ledgers"."delta"),
	CONSTRAINT "point_ledgers_game_category_check" CHECK ((
        ("point_ledgers"."category" = 'GAME' and "point_ledgers"."game_type" is not null) or
        ("point_ledgers"."category" <> 'GAME' and "point_ledgers"."game_type" is null)
      ))
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"role" text DEFAULT 'PLAYER' NOT NULL,
	"display_name" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_role_check" CHECK ("user_profiles"."role" in ('PLAYER', 'ADMIN')),
	CONSTRAINT "user_profiles_status_check" CHECK ("user_profiles"."status" in ('ACTIVE', 'SUSPENDED', 'CLOSED'))
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"locked_balance" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_balance_non_negative" CHECK ("wallets"."balance" >= 0),
	CONSTRAINT "wallets_locked_balance_non_negative" CHECK ("wallets"."locked_balance" >= 0),
	CONSTRAINT "wallets_locked_balance_lte_balance" CHECK ("wallets"."locked_balance" <= "wallets"."balance"),
	CONSTRAINT "wallets_version_non_negative" CHECK ("wallets"."version" >= 0),
	CONSTRAINT "wallets_status_check" CHECK ("wallets"."status" in ('ACTIVE', 'LOCKED', 'CLOSED'))
);
--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_actions" ADD CONSTRAINT "blackjack_actions_round_id_blackjack_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."blackjack_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_actions" ADD CONSTRAINT "blackjack_actions_round_seat_id_blackjack_round_seats_id_fk" FOREIGN KEY ("round_seat_id") REFERENCES "public"."blackjack_round_seats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_actions" ADD CONSTRAINT "blackjack_actions_hand_id_blackjack_hands_id_fk" FOREIGN KEY ("hand_id") REFERENCES "public"."blackjack_hands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_actions" ADD CONSTRAINT "blackjack_actions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_hands" ADD CONSTRAINT "blackjack_hands_round_id_blackjack_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."blackjack_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_hands" ADD CONSTRAINT "blackjack_hands_round_seat_id_blackjack_round_seats_id_fk" FOREIGN KEY ("round_seat_id") REFERENCES "public"."blackjack_round_seats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_round_seats" ADD CONSTRAINT "blackjack_round_seats_round_id_blackjack_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."blackjack_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_round_seats" ADD CONSTRAINT "blackjack_round_seats_table_id_blackjack_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."blackjack_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_round_seats" ADD CONSTRAINT "blackjack_round_seats_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_rounds" ADD CONSTRAINT "blackjack_rounds_table_id_blackjack_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."blackjack_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_rounds" ADD CONSTRAINT "blackjack_rounds_shoe_id_blackjack_shoes_id_fk" FOREIGN KEY ("shoe_id") REFERENCES "public"."blackjack_shoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_shoes" ADD CONSTRAINT "blackjack_shoes_table_id_blackjack_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."blackjack_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_side_bets" ADD CONSTRAINT "blackjack_side_bets_round_id_blackjack_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."blackjack_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_side_bets" ADD CONSTRAINT "blackjack_side_bets_round_seat_id_blackjack_round_seats_id_fk" FOREIGN KEY ("round_seat_id") REFERENCES "public"."blackjack_round_seats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_table_seats" ADD CONSTRAINT "blackjack_table_seats_table_id_blackjack_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."blackjack_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_table_seats" ADD CONSTRAINT "blackjack_table_seats_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_reward_claims" ADD CONSTRAINT "daily_reward_claims_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_reward_claims" ADD CONSTRAINT "daily_reward_claims_ledger_id_point_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."point_ledgers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledgers" ADD CONSTRAINT "point_ledgers_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledgers" ADD CONSTRAINT "point_ledgers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_logs_actor_created_idx" ON "admin_audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_target_idx" ON "admin_audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_unique" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_unique" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_unique" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_created_at_idx" ON "user" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "verification_expires_at_idx" ON "verification" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "blackjack_actions_round_sequence_unique" ON "blackjack_actions" USING btree ("round_id","action_sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "blackjack_actions_round_command_unique" ON "blackjack_actions" USING btree ("round_id","command_id") WHERE "blackjack_actions"."command_id" is not null;--> statement-breakpoint
CREATE INDEX "blackjack_actions_round_id_idx" ON "blackjack_actions" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "blackjack_actions_round_seat_id_idx" ON "blackjack_actions" USING btree ("round_seat_id");--> statement-breakpoint
CREATE INDEX "blackjack_actions_hand_id_idx" ON "blackjack_actions" USING btree ("hand_id");--> statement-breakpoint
CREATE INDEX "blackjack_actions_user_id_idx" ON "blackjack_actions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blackjack_hands_round_seat_hand_unique" ON "blackjack_hands" USING btree ("round_seat_id","hand_no");--> statement-breakpoint
CREATE INDEX "blackjack_hands_round_id_idx" ON "blackjack_hands" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "blackjack_hands_round_seat_id_idx" ON "blackjack_hands" USING btree ("round_seat_id");--> statement-breakpoint
CREATE INDEX "blackjack_hands_source_hand_id_idx" ON "blackjack_hands" USING btree ("source_hand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blackjack_round_seats_round_seat_unique" ON "blackjack_round_seats" USING btree ("round_id","seat_no");--> statement-breakpoint
CREATE INDEX "blackjack_round_seats_round_user_idx" ON "blackjack_round_seats" USING btree ("round_id","user_id");--> statement-breakpoint
CREATE INDEX "blackjack_round_seats_table_user_idx" ON "blackjack_round_seats" USING btree ("table_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blackjack_rounds_table_round_no_unique" ON "blackjack_rounds" USING btree ("table_id","round_no");--> statement-breakpoint
CREATE INDEX "blackjack_rounds_table_status_idx" ON "blackjack_rounds" USING btree ("table_id","status");--> statement-breakpoint
CREATE INDEX "blackjack_rounds_shoe_id_idx" ON "blackjack_rounds" USING btree ("shoe_id");--> statement-breakpoint
CREATE INDEX "blackjack_shoes_table_status_idx" ON "blackjack_shoes" USING btree ("table_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "blackjack_side_bets_round_seat_type_unique" ON "blackjack_side_bets" USING btree ("round_seat_id","type");--> statement-breakpoint
CREATE INDEX "blackjack_side_bets_round_id_idx" ON "blackjack_side_bets" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "blackjack_side_bets_round_seat_id_idx" ON "blackjack_side_bets" USING btree ("round_seat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blackjack_table_seats_table_seat_unique" ON "blackjack_table_seats" USING btree ("table_id","seat_no");--> statement-breakpoint
CREATE INDEX "blackjack_table_seats_table_user_idx" ON "blackjack_table_seats" USING btree ("table_id","user_id");--> statement-breakpoint
CREATE INDEX "blackjack_table_seats_user_id_idx" ON "blackjack_table_seats" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "blackjack_tables_status_idx" ON "blackjack_tables" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_reward_claims_user_date_unique" ON "daily_reward_claims" USING btree ("user_id","claim_date");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_reward_claims_ledger_id_unique" ON "daily_reward_claims" USING btree ("ledger_id");--> statement-breakpoint
CREATE INDEX "daily_reward_claims_user_id_idx" ON "daily_reward_claims" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "point_ledgers_user_idempotency_unique" ON "point_ledgers" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "point_ledgers_wallet_created_idx" ON "point_ledgers" USING btree ("wallet_id","created_at");--> statement-breakpoint
CREATE INDEX "point_ledgers_user_created_idx" ON "point_ledgers" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "point_ledgers_reference_idx" ON "point_ledgers" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "point_ledgers_game_created_idx" ON "point_ledgers" USING btree ("game_type","created_at");--> statement-breakpoint
CREATE INDEX "user_profiles_status_idx" ON "user_profiles" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_user_id_unique" ON "wallets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallets_status_idx" ON "wallets" USING btree ("status");