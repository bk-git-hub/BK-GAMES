CREATE TABLE "racing_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"race_id" uuid NOT NULL,
	"bet_id" uuid,
	"user_id" text,
	"actor_type" text NOT NULL,
	"action_type" text NOT NULL,
	"action_sequence" integer NOT NULL,
	"command_id" text,
	"amount" bigint,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "racing_actions_sequence_positive" CHECK ("racing_actions"."action_sequence" > 0),
	CONSTRAINT "racing_actions_actor_type_check" CHECK ("racing_actions"."actor_type" in ('PLAYER', 'SYSTEM')),
	CONSTRAINT "racing_actions_action_type_check" CHECK ("racing_actions"."action_type" in (
        'PLACE_BET',
        'RACE_START',
        'FINISH',
        'SETTLE',
        'CANCEL'
      )),
	CONSTRAINT "racing_actions_amount_non_negative" CHECK ("racing_actions"."amount" is null or "racing_actions"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "racing_bets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"race_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"race_entry_id" uuid NOT NULL,
	"horse_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"bet_type" text DEFAULT 'WIN' NOT NULL,
	"status" text DEFAULT 'PLACED' NOT NULL,
	"amount" bigint NOT NULL,
	"odds_numerator" integer NOT NULL,
	"odds_denominator" integer NOT NULL,
	"payout_amount" bigint DEFAULT 0 NOT NULL,
	"net_amount" bigint DEFAULT 0 NOT NULL,
	"placed_ledger_id" uuid NOT NULL,
	"settlement_ledger_id" uuid,
	"command_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "racing_bets_amount_positive" CHECK ("racing_bets"."amount" > 0),
	CONSTRAINT "racing_bets_type_check" CHECK ("racing_bets"."bet_type" in ('WIN')),
	CONSTRAINT "racing_bets_status_check" CHECK ("racing_bets"."status" in ('PLACED', 'WON', 'LOST', 'CANCELLED')),
	CONSTRAINT "racing_bets_odds_positive" CHECK ("racing_bets"."odds_numerator" > 0 and "racing_bets"."odds_denominator" > 0),
	CONSTRAINT "racing_bets_payout_non_negative" CHECK ("racing_bets"."payout_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "racing_horses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"silk_color" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "racing_horses_name_not_empty" CHECK (length(trim("racing_horses"."name")) > 0),
	CONSTRAINT "racing_horses_silk_color_not_empty" CHECK (length(trim("racing_horses"."silk_color")) > 0)
);
--> statement-breakpoint
CREATE TABLE "racing_race_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"race_id" uuid NOT NULL,
	"horse_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"gate_no" integer NOT NULL,
	"lane" integer NOT NULL,
	"temporary_profile" jsonb,
	"final_rank" integer,
	"finished_at_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "racing_entries_race_id_id_horse_id_unique" UNIQUE("race_id","id","horse_id"),
	CONSTRAINT "racing_entries_number_positive" CHECK ("racing_race_entries"."number" > 0),
	CONSTRAINT "racing_entries_gate_no_positive" CHECK ("racing_race_entries"."gate_no" > 0),
	CONSTRAINT "racing_entries_lane_positive" CHECK ("racing_race_entries"."lane" > 0),
	CONSTRAINT "racing_entries_final_rank_positive" CHECK ("racing_race_entries"."final_rank" is null or "racing_race_entries"."final_rank" > 0),
	CONSTRAINT "racing_entries_finished_at_non_negative" CHECK ("racing_race_entries"."finished_at_ms" is null or "racing_race_entries"."finished_at_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "racing_races" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"race_no" integer NOT NULL,
	"status" text DEFAULT 'BETTING' NOT NULL,
	"seed" text,
	"seed_locked_at" timestamp with time zone,
	"distance_m" integer NOT NULL,
	"field_size" integer NOT NULL,
	"phase" text DEFAULT 'BETTING' NOT NULL,
	"betting_opens_at" timestamp with time zone,
	"betting_closes_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"result_order" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"runtime_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "racing_races_table_id_id_unique" UNIQUE("table_id","id"),
	CONSTRAINT "racing_races_race_no_positive" CHECK ("racing_races"."race_no" > 0),
	CONSTRAINT "racing_races_status_check" CHECK ("racing_races"."status" in (
        'BETTING',
        'LOCKING_BETS',
        'RUNNING',
        'FINISHING',
        'SETTLING',
        'SETTLED',
        'ROUND_END',
        'CANCELLED'
      )),
	CONSTRAINT "racing_races_phase_check" CHECK ("racing_races"."phase" in (
        'BETTING',
        'LOCKING_BETS',
        'RUNNING',
        'FINISHING',
        'SETTLING',
        'SETTLED',
        'ROUND_END',
        'CANCELLED'
      )),
	CONSTRAINT "racing_races_seed_lock_check" CHECK ((
        ("racing_races"."seed" is null and "racing_races"."seed_locked_at" is null) or
        ("racing_races"."seed" is not null and "racing_races"."seed_locked_at" is not null)
      )),
	CONSTRAINT "racing_races_seed_after_betting_check" CHECK ((
        "racing_races"."phase" <> 'BETTING' or
        ("racing_races"."seed" is null and "racing_races"."seed_locked_at" is null)
      )),
	CONSTRAINT "racing_races_distance_positive" CHECK ("racing_races"."distance_m" > 0),
	CONSTRAINT "racing_races_field_size_check" CHECK ("racing_races"."field_size" between 6 and 8)
);
--> statement-breakpoint
CREATE TABLE "racing_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"field_size" integer DEFAULT 6 NOT NULL,
	"min_bet" bigint NOT NULL,
	"max_bet" bigint NOT NULL,
	"payout_rate_bps" integer DEFAULT 9000 NOT NULL,
	"betting_timeout_seconds" integer DEFAULT 20 NOT NULL,
	"tick_interval_ms" integer DEFAULT 100 NOT NULL,
	"race_distance_m" integer DEFAULT 1200 NOT NULL,
	"round_end_delay_seconds" integer DEFAULT 8 NOT NULL,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "racing_tables_code_not_empty" CHECK (length(trim("racing_tables"."code")) > 0),
	CONSTRAINT "racing_tables_status_check" CHECK ("racing_tables"."status" in ('OPEN', 'MAINTENANCE', 'CLOSED')),
	CONSTRAINT "racing_tables_field_size_check" CHECK ("racing_tables"."field_size" between 6 and 8),
	CONSTRAINT "racing_tables_min_bet_positive" CHECK ("racing_tables"."min_bet" > 0),
	CONSTRAINT "racing_tables_max_bet_check" CHECK ("racing_tables"."max_bet" >= "racing_tables"."min_bet"),
	CONSTRAINT "racing_tables_payout_rate_check" CHECK ("racing_tables"."payout_rate_bps" between 1 and 10000),
	CONSTRAINT "racing_tables_betting_timeout_check" CHECK ("racing_tables"."betting_timeout_seconds" > 0),
	CONSTRAINT "racing_tables_tick_interval_check" CHECK ("racing_tables"."tick_interval_ms" > 0),
	CONSTRAINT "racing_tables_distance_check" CHECK ("racing_tables"."race_distance_m" > 0),
	CONSTRAINT "racing_tables_round_end_delay_check" CHECK ("racing_tables"."round_end_delay_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "racing_ticks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"race_id" uuid NOT NULL,
	"tick" integer NOT NULL,
	"elapsed_ms" integer NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "racing_ticks_tick_non_negative" CHECK ("racing_ticks"."tick" >= 0),
	CONSTRAINT "racing_ticks_elapsed_non_negative" CHECK ("racing_ticks"."elapsed_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "point_ledgers" DROP CONSTRAINT "point_ledgers_game_type_check";--> statement-breakpoint
ALTER TABLE "racing_actions" ADD CONSTRAINT "racing_actions_race_id_racing_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."racing_races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "racing_actions" ADD CONSTRAINT "racing_actions_bet_id_racing_bets_id_fk" FOREIGN KEY ("bet_id") REFERENCES "public"."racing_bets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "racing_actions" ADD CONSTRAINT "racing_actions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "racing_bets" ADD CONSTRAINT "racing_bets_table_id_racing_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."racing_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "racing_bets" ADD CONSTRAINT "racing_bets_horse_id_racing_horses_id_fk" FOREIGN KEY ("horse_id") REFERENCES "public"."racing_horses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "racing_bets" ADD CONSTRAINT "racing_bets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "racing_bets" ADD CONSTRAINT "racing_bets_placed_ledger_id_point_ledgers_id_fk" FOREIGN KEY ("placed_ledger_id") REFERENCES "public"."point_ledgers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "racing_bets" ADD CONSTRAINT "racing_bets_settlement_ledger_id_point_ledgers_id_fk" FOREIGN KEY ("settlement_ledger_id") REFERENCES "public"."point_ledgers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "racing_bets" ADD CONSTRAINT "racing_bets_race_table_fk" FOREIGN KEY ("table_id","race_id") REFERENCES "public"."racing_races"("table_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "racing_bets" ADD CONSTRAINT "racing_bets_race_entry_fk" FOREIGN KEY ("race_id","race_entry_id","horse_id") REFERENCES "public"."racing_race_entries"("race_id","id","horse_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "racing_race_entries" ADD CONSTRAINT "racing_race_entries_race_id_racing_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."racing_races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "racing_race_entries" ADD CONSTRAINT "racing_race_entries_horse_id_racing_horses_id_fk" FOREIGN KEY ("horse_id") REFERENCES "public"."racing_horses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "racing_races" ADD CONSTRAINT "racing_races_table_id_racing_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."racing_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "racing_ticks" ADD CONSTRAINT "racing_ticks_race_id_racing_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."racing_races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "racing_actions_race_sequence_unique" ON "racing_actions" USING btree ("race_id","action_sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "racing_actions_race_command_unique" ON "racing_actions" USING btree ("race_id","command_id") WHERE "racing_actions"."command_id" is not null;--> statement-breakpoint
CREATE INDEX "racing_actions_race_id_idx" ON "racing_actions" USING btree ("race_id");--> statement-breakpoint
CREATE INDEX "racing_actions_bet_id_idx" ON "racing_actions" USING btree ("bet_id");--> statement-breakpoint
CREATE INDEX "racing_actions_user_id_idx" ON "racing_actions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "racing_bets_race_user_unique" ON "racing_bets" USING btree ("race_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "racing_bets_race_user_command_unique" ON "racing_bets" USING btree ("race_id","user_id","command_id");--> statement-breakpoint
CREATE UNIQUE INDEX "racing_bets_placed_ledger_unique" ON "racing_bets" USING btree ("placed_ledger_id");--> statement-breakpoint
CREATE UNIQUE INDEX "racing_bets_settlement_ledger_unique" ON "racing_bets" USING btree ("settlement_ledger_id") WHERE "racing_bets"."settlement_ledger_id" is not null;--> statement-breakpoint
CREATE INDEX "racing_bets_race_id_idx" ON "racing_bets" USING btree ("race_id");--> statement-breakpoint
CREATE INDEX "racing_bets_table_id_idx" ON "racing_bets" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "racing_bets_race_entry_id_idx" ON "racing_bets" USING btree ("race_entry_id");--> statement-breakpoint
CREATE INDEX "racing_bets_user_id_idx" ON "racing_bets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "racing_horses_active_idx" ON "racing_horses" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "racing_entries_race_horse_unique" ON "racing_race_entries" USING btree ("race_id","horse_id");--> statement-breakpoint
CREATE UNIQUE INDEX "racing_entries_race_number_unique" ON "racing_race_entries" USING btree ("race_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "racing_entries_race_gate_unique" ON "racing_race_entries" USING btree ("race_id","gate_no");--> statement-breakpoint
CREATE INDEX "racing_entries_race_id_idx" ON "racing_race_entries" USING btree ("race_id");--> statement-breakpoint
CREATE INDEX "racing_entries_horse_id_idx" ON "racing_race_entries" USING btree ("horse_id");--> statement-breakpoint
CREATE UNIQUE INDEX "racing_races_table_race_no_unique" ON "racing_races" USING btree ("table_id","race_no");--> statement-breakpoint
CREATE INDEX "racing_races_table_status_idx" ON "racing_races" USING btree ("table_id","status");--> statement-breakpoint
CREATE INDEX "racing_races_table_phase_idx" ON "racing_races" USING btree ("table_id","phase");--> statement-breakpoint
CREATE UNIQUE INDEX "racing_tables_code_unique" ON "racing_tables" USING btree ("code");--> statement-breakpoint
CREATE INDEX "racing_tables_status_idx" ON "racing_tables" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "racing_ticks_race_tick_unique" ON "racing_ticks" USING btree ("race_id","tick");--> statement-breakpoint
CREATE INDEX "racing_ticks_race_id_idx" ON "racing_ticks" USING btree ("race_id");--> statement-breakpoint
ALTER TABLE "point_ledgers" ADD CONSTRAINT "point_ledgers_game_type_check" CHECK ("point_ledgers"."game_type" is null or "point_ledgers"."game_type" in ('BLACKJACK', 'BACCARAT', 'RACING'));