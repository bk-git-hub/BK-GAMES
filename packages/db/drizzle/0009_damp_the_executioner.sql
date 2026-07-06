CREATE TABLE "baccarat_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"bet_id" uuid,
	"user_id" text,
	"actor_type" text NOT NULL,
	"action_type" text NOT NULL,
	"action_sequence" integer NOT NULL,
	"command_id" text,
	"amount" bigint,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "baccarat_actions_sequence_positive" CHECK ("baccarat_actions"."action_sequence" > 0),
	CONSTRAINT "baccarat_actions_actor_type_check" CHECK ("baccarat_actions"."actor_type" in ('PLAYER', 'SYSTEM')),
	CONSTRAINT "baccarat_actions_action_type_check" CHECK ("baccarat_actions"."action_type" in (
        'PLACE_BET',
        'SHOE_START',
        'DEAL',
        'SQUEEZE_PROGRESS',
        'REVEAL_CARD',
        'AUTO_REVEAL',
        'SETTLE',
        'CANCEL'
      )),
	CONSTRAINT "baccarat_actions_amount_non_negative" CHECK ("baccarat_actions"."amount" is null or "baccarat_actions"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "baccarat_bets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"bet_type" text DEFAULT 'PLAYER' NOT NULL,
	"bet_group" text DEFAULT 'MAIN' NOT NULL,
	"status" text DEFAULT 'PLACED' NOT NULL,
	"amount" bigint NOT NULL,
	"odds_numerator" integer NOT NULL,
	"odds_denominator" integer NOT NULL,
	"commission_bps_snapshot" integer DEFAULT 0 NOT NULL,
	"payout_amount" bigint DEFAULT 0 NOT NULL,
	"net_amount" bigint DEFAULT 0 NOT NULL,
	"placed_ledger_id" uuid NOT NULL,
	"settlement_ledger_id" uuid,
	"refund_ledger_id" uuid,
	"command_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "baccarat_bets_round_id_id_unique" UNIQUE("round_id","id"),
	CONSTRAINT "baccarat_bets_type_check" CHECK ("baccarat_bets"."bet_type" in ('PLAYER', 'BANKER', 'TIE')),
	CONSTRAINT "baccarat_bets_group_check" CHECK ("baccarat_bets"."bet_group" in ('MAIN', 'SIDE')),
	CONSTRAINT "baccarat_bets_status_check" CHECK ("baccarat_bets"."status" in ('PLACED', 'SETTLED', 'CANCELLED')),
	CONSTRAINT "baccarat_bets_amount_positive" CHECK ("baccarat_bets"."amount" > 0),
	CONSTRAINT "baccarat_bets_odds_positive" CHECK ("baccarat_bets"."odds_numerator" > 0 and "baccarat_bets"."odds_denominator" > 0),
	CONSTRAINT "baccarat_bets_commission_check" CHECK ("baccarat_bets"."commission_bps_snapshot" between 0 and 10000),
	CONSTRAINT "baccarat_bets_payout_non_negative" CHECK ("baccarat_bets"."payout_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "baccarat_reveals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"slot" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"sequence" integer NOT NULL,
	"squeezer_user_id" text,
	"progress" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"revealed_at" timestamp with time zone,
	"revealed_by" text,
	"card_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "baccarat_reveals_sequence_positive" CHECK ("baccarat_reveals"."sequence" > 0),
	CONSTRAINT "baccarat_reveals_slot_check" CHECK ("baccarat_reveals"."slot" in (
        'PLAYER_CARD_1',
        'BANKER_CARD_1',
        'PLAYER_CARD_2',
        'BANKER_CARD_2',
        'PLAYER_CARD_3',
        'BANKER_CARD_3'
      )),
	CONSTRAINT "baccarat_reveals_status_check" CHECK ("baccarat_reveals"."status" in ('PENDING', 'ACTIVE', 'REVEALED', 'SKIPPED')),
	CONSTRAINT "baccarat_reveals_progress_check" CHECK ("baccarat_reveals"."progress" between 0 and 100),
	CONSTRAINT "baccarat_reveals_card_snapshot_gate" CHECK ((
        ("baccarat_reveals"."status" <> 'REVEALED' and "baccarat_reveals"."card_snapshot" is null) or
        ("baccarat_reveals"."status" = 'REVEALED' and "baccarat_reveals"."card_snapshot" is not null)
      ))
);
--> statement-breakpoint
CREATE TABLE "baccarat_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"shoe_id" uuid NOT NULL,
	"round_index_in_shoe" integer NOT NULL,
	"round_no" integer NOT NULL,
	"status" text DEFAULT 'WAITING_BETS' NOT NULL,
	"player_cards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"banker_cards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"player_total" integer,
	"banker_total" integer,
	"outcome" text,
	"is_natural" boolean DEFAULT false NOT NULL,
	"total_cards" integer,
	"result_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rule_snapshot" jsonb NOT NULL,
	"reveal_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"roadmap_snapshot" jsonb,
	"betting_opens_at" timestamp with time zone,
	"betting_closes_at" timestamp with time zone,
	"dealt_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "baccarat_rounds_table_id_id_unique" UNIQUE("table_id","id"),
	CONSTRAINT "baccarat_rounds_round_index_positive" CHECK ("baccarat_rounds"."round_index_in_shoe" > 0),
	CONSTRAINT "baccarat_rounds_round_no_positive" CHECK ("baccarat_rounds"."round_no" > 0),
	CONSTRAINT "baccarat_rounds_status_check" CHECK ("baccarat_rounds"."status" in (
        'WAITING_BETS',
        'DEALING',
        'SQUEEZE',
        'SETTLING',
        'SETTLED',
        'CANCELLED'
      )),
	CONSTRAINT "baccarat_rounds_outcome_check" CHECK ("baccarat_rounds"."outcome" is null or "baccarat_rounds"."outcome" in ('PLAYER', 'BANKER', 'TIE')),
	CONSTRAINT "baccarat_rounds_player_total_check" CHECK ("baccarat_rounds"."player_total" is null or "baccarat_rounds"."player_total" between 0 and 9),
	CONSTRAINT "baccarat_rounds_banker_total_check" CHECK ("baccarat_rounds"."banker_total" is null or "baccarat_rounds"."banker_total" between 0 and 9),
	CONSTRAINT "baccarat_rounds_total_cards_check" CHECK ("baccarat_rounds"."total_cards" is null or "baccarat_rounds"."total_cards" between 4 and 6),
	CONSTRAINT "baccarat_rounds_betting_window_check" CHECK ((
        "baccarat_rounds"."betting_opens_at" is null or
        "baccarat_rounds"."betting_closes_at" is null or
        "baccarat_rounds"."betting_opens_at" <= "baccarat_rounds"."betting_closes_at"
      ))
);
--> statement-breakpoint
CREATE TABLE "baccarat_shoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"shoe_no" integer NOT NULL,
	"status" text DEFAULT 'READY' NOT NULL,
	"deck_count" integer NOT NULL,
	"cards_total" integer NOT NULL,
	"cards_dealt" integer DEFAULT 0 NOT NULL,
	"cards_remaining" integer NOT NULL,
	"cut_card_position" integer NOT NULL,
	"shuffle_algorithm" text DEFAULT 'FISHER_YATES_V1' NOT NULL,
	"server_seed_hash" text NOT NULL,
	"encrypted_state" text,
	"state_version" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "baccarat_shoes_table_id_id_unique" UNIQUE("table_id","id"),
	CONSTRAINT "baccarat_shoes_shoe_no_positive" CHECK ("baccarat_shoes"."shoe_no" > 0),
	CONSTRAINT "baccarat_shoes_status_check" CHECK ("baccarat_shoes"."status" in ('READY', 'ACTIVE', 'COMPLETED', 'VOID')),
	CONSTRAINT "baccarat_shoes_deck_count_check" CHECK ("baccarat_shoes"."deck_count" between 1 and 8),
	CONSTRAINT "baccarat_shoes_cards_total_check" CHECK ("baccarat_shoes"."cards_total" = "baccarat_shoes"."deck_count" * 52),
	CONSTRAINT "baccarat_shoes_cards_dealt_check" CHECK ("baccarat_shoes"."cards_dealt" between 0 and "baccarat_shoes"."cards_total"),
	CONSTRAINT "baccarat_shoes_cards_remaining_check" CHECK ("baccarat_shoes"."cards_remaining" between 0 and "baccarat_shoes"."cards_total"),
	CONSTRAINT "baccarat_shoes_cards_count_math" CHECK ("baccarat_shoes"."cards_dealt" + "baccarat_shoes"."cards_remaining" = "baccarat_shoes"."cards_total"),
	CONSTRAINT "baccarat_shoes_cut_card_position_check" CHECK ("baccarat_shoes"."cut_card_position" between 1 and "baccarat_shoes"."cards_total"),
	CONSTRAINT "baccarat_shoes_seed_hash_not_empty" CHECK (length(trim("baccarat_shoes"."server_seed_hash")) > 0),
	CONSTRAINT "baccarat_shoes_state_version_check" CHECK ("baccarat_shoes"."state_version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "baccarat_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"min_bet" bigint NOT NULL,
	"max_main_bet" bigint NOT NULL,
	"max_total_bet_per_user" bigint NOT NULL,
	"betting_timeout_seconds" integer DEFAULT 15 NOT NULL,
	"squeeze_timeout_seconds" integer DEFAULT 8 NOT NULL,
	"round_end_delay_seconds" integer DEFAULT 5 NOT NULL,
	"deck_count" integer DEFAULT 8 NOT NULL,
	"shoe_penetration_percent" integer DEFAULT 75 NOT NULL,
	"minimum_cards_before_round" integer DEFAULT 6 NOT NULL,
	"result_history_limit" integer DEFAULT 72 NOT NULL,
	"tie_payout_numerator" integer DEFAULT 8 NOT NULL,
	"tie_payout_denominator" integer DEFAULT 1 NOT NULL,
	"banker_commission_bps" integer DEFAULT 500 NOT NULL,
	"roadmap_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "baccarat_tables_code_not_empty" CHECK (length(trim("baccarat_tables"."code")) > 0),
	CONSTRAINT "baccarat_tables_status_check" CHECK ("baccarat_tables"."status" in ('OPEN', 'MAINTENANCE', 'CLOSED')),
	CONSTRAINT "baccarat_tables_min_bet_positive" CHECK ("baccarat_tables"."min_bet" > 0),
	CONSTRAINT "baccarat_tables_max_main_bet_check" CHECK ("baccarat_tables"."max_main_bet" >= "baccarat_tables"."min_bet"),
	CONSTRAINT "baccarat_tables_max_total_user_check" CHECK ("baccarat_tables"."max_total_bet_per_user" >= "baccarat_tables"."max_main_bet"),
	CONSTRAINT "baccarat_tables_betting_timeout_check" CHECK ("baccarat_tables"."betting_timeout_seconds" > 0),
	CONSTRAINT "baccarat_tables_squeeze_timeout_check" CHECK ("baccarat_tables"."squeeze_timeout_seconds" > 0),
	CONSTRAINT "baccarat_tables_round_end_delay_check" CHECK ("baccarat_tables"."round_end_delay_seconds" >= 0),
	CONSTRAINT "baccarat_tables_deck_count_check" CHECK ("baccarat_tables"."deck_count" between 1 and 8),
	CONSTRAINT "baccarat_tables_shoe_penetration_check" CHECK ("baccarat_tables"."shoe_penetration_percent" between 50 and 90),
	CONSTRAINT "baccarat_tables_minimum_cards_check" CHECK ("baccarat_tables"."minimum_cards_before_round" >= 4),
	CONSTRAINT "baccarat_tables_result_history_check" CHECK ("baccarat_tables"."result_history_limit" > 0),
	CONSTRAINT "baccarat_tables_tie_payout_check" CHECK ("baccarat_tables"."tie_payout_numerator" > 0 and "baccarat_tables"."tie_payout_denominator" > 0),
	CONSTRAINT "baccarat_tables_commission_check" CHECK ("baccarat_tables"."banker_commission_bps" between 0 and 10000)
);
--> statement-breakpoint
ALTER TABLE "baccarat_actions" ADD CONSTRAINT "baccarat_actions_round_id_baccarat_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."baccarat_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baccarat_actions" ADD CONSTRAINT "baccarat_actions_bet_id_baccarat_bets_id_fk" FOREIGN KEY ("bet_id") REFERENCES "public"."baccarat_bets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baccarat_actions" ADD CONSTRAINT "baccarat_actions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baccarat_bets" ADD CONSTRAINT "baccarat_bets_round_id_baccarat_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."baccarat_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baccarat_bets" ADD CONSTRAINT "baccarat_bets_table_id_baccarat_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."baccarat_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baccarat_bets" ADD CONSTRAINT "baccarat_bets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baccarat_bets" ADD CONSTRAINT "baccarat_bets_placed_ledger_id_point_ledgers_id_fk" FOREIGN KEY ("placed_ledger_id") REFERENCES "public"."point_ledgers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baccarat_bets" ADD CONSTRAINT "baccarat_bets_settlement_ledger_id_point_ledgers_id_fk" FOREIGN KEY ("settlement_ledger_id") REFERENCES "public"."point_ledgers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baccarat_bets" ADD CONSTRAINT "baccarat_bets_refund_ledger_id_point_ledgers_id_fk" FOREIGN KEY ("refund_ledger_id") REFERENCES "public"."point_ledgers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baccarat_bets" ADD CONSTRAINT "baccarat_bets_round_table_fk" FOREIGN KEY ("table_id","round_id") REFERENCES "public"."baccarat_rounds"("table_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baccarat_reveals" ADD CONSTRAINT "baccarat_reveals_round_id_baccarat_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."baccarat_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baccarat_reveals" ADD CONSTRAINT "baccarat_reveals_table_id_baccarat_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."baccarat_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baccarat_reveals" ADD CONSTRAINT "baccarat_reveals_squeezer_user_id_user_id_fk" FOREIGN KEY ("squeezer_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baccarat_reveals" ADD CONSTRAINT "baccarat_reveals_round_table_fk" FOREIGN KEY ("table_id","round_id") REFERENCES "public"."baccarat_rounds"("table_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baccarat_rounds" ADD CONSTRAINT "baccarat_rounds_table_id_baccarat_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."baccarat_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baccarat_rounds" ADD CONSTRAINT "baccarat_rounds_shoe_id_baccarat_shoes_id_fk" FOREIGN KEY ("shoe_id") REFERENCES "public"."baccarat_shoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baccarat_rounds" ADD CONSTRAINT "baccarat_rounds_table_shoe_fk" FOREIGN KEY ("table_id","shoe_id") REFERENCES "public"."baccarat_shoes"("table_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baccarat_shoes" ADD CONSTRAINT "baccarat_shoes_table_id_baccarat_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."baccarat_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "baccarat_actions_round_sequence_unique" ON "baccarat_actions" USING btree ("round_id","action_sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "baccarat_actions_round_user_command_unique" ON "baccarat_actions" USING btree ("round_id","user_id","command_id") WHERE "baccarat_actions"."user_id" is not null and "baccarat_actions"."command_id" is not null;--> statement-breakpoint
CREATE INDEX "baccarat_actions_round_id_idx" ON "baccarat_actions" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "baccarat_actions_bet_id_idx" ON "baccarat_actions" USING btree ("bet_id");--> statement-breakpoint
CREATE INDEX "baccarat_actions_user_id_idx" ON "baccarat_actions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "baccarat_bets_round_user_main_unique" ON "baccarat_bets" USING btree ("round_id","user_id") WHERE "baccarat_bets"."bet_group" = 'MAIN';--> statement-breakpoint
CREATE UNIQUE INDEX "baccarat_bets_round_user_command_unique" ON "baccarat_bets" USING btree ("round_id","user_id","command_id");--> statement-breakpoint
CREATE UNIQUE INDEX "baccarat_bets_placed_ledger_unique" ON "baccarat_bets" USING btree ("placed_ledger_id");--> statement-breakpoint
CREATE UNIQUE INDEX "baccarat_bets_settlement_ledger_unique" ON "baccarat_bets" USING btree ("settlement_ledger_id") WHERE "baccarat_bets"."settlement_ledger_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "baccarat_bets_refund_ledger_unique" ON "baccarat_bets" USING btree ("refund_ledger_id") WHERE "baccarat_bets"."refund_ledger_id" is not null;--> statement-breakpoint
CREATE INDEX "baccarat_bets_round_id_idx" ON "baccarat_bets" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "baccarat_bets_table_id_idx" ON "baccarat_bets" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "baccarat_bets_user_id_idx" ON "baccarat_bets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "baccarat_bets_status_idx" ON "baccarat_bets" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "baccarat_reveals_round_sequence_unique" ON "baccarat_reveals" USING btree ("round_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "baccarat_reveals_round_slot_unique" ON "baccarat_reveals" USING btree ("round_id","slot");--> statement-breakpoint
CREATE INDEX "baccarat_reveals_table_status_idx" ON "baccarat_reveals" USING btree ("table_id","status");--> statement-breakpoint
CREATE INDEX "baccarat_reveals_squeezer_user_idx" ON "baccarat_reveals" USING btree ("squeezer_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "baccarat_rounds_table_round_no_unique" ON "baccarat_rounds" USING btree ("table_id","round_no");--> statement-breakpoint
CREATE UNIQUE INDEX "baccarat_rounds_shoe_index_unique" ON "baccarat_rounds" USING btree ("shoe_id","round_index_in_shoe");--> statement-breakpoint
CREATE INDEX "baccarat_rounds_table_status_idx" ON "baccarat_rounds" USING btree ("table_id","status");--> statement-breakpoint
CREATE INDEX "baccarat_rounds_shoe_id_idx" ON "baccarat_rounds" USING btree ("shoe_id");--> statement-breakpoint
CREATE UNIQUE INDEX "baccarat_shoes_table_shoe_no_unique" ON "baccarat_shoes" USING btree ("table_id","shoe_no");--> statement-breakpoint
CREATE INDEX "baccarat_shoes_table_status_idx" ON "baccarat_shoes" USING btree ("table_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "baccarat_tables_code_unique" ON "baccarat_tables" USING btree ("code");--> statement-breakpoint
CREATE INDEX "baccarat_tables_status_idx" ON "baccarat_tables" USING btree ("status");