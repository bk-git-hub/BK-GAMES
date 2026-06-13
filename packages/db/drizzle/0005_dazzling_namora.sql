CREATE TABLE "racing_bet_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bet_id" uuid NOT NULL,
	"race_id" uuid NOT NULL,
	"race_entry_id" uuid NOT NULL,
	"horse_id" uuid NOT NULL,
	"selection_order" integer NOT NULL,
	"expected_rank" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "racing_bet_selections_order_positive" CHECK ("racing_bet_selections"."selection_order" > 0),
	CONSTRAINT "racing_bet_selections_expected_rank_positive" CHECK ("racing_bet_selections"."expected_rank" is null or "racing_bet_selections"."expected_rank" > 0)
);
--> statement-breakpoint
ALTER TABLE "racing_bets" DROP CONSTRAINT "racing_bets_type_check";--> statement-breakpoint
ALTER TABLE "racing_races" DROP CONSTRAINT "racing_races_status_check";--> statement-breakpoint
ALTER TABLE "racing_races" DROP CONSTRAINT "racing_races_phase_check";--> statement-breakpoint
DROP INDEX "racing_bets_race_user_unique";--> statement-breakpoint
ALTER TABLE "racing_tables" ALTER COLUMN "betting_timeout_seconds" SET DEFAULT 150;--> statement-breakpoint
ALTER TABLE "racing_races" ADD COLUMN "scheduled_start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "racing_tables" ADD COLUMN "race_interval_seconds" integer DEFAULT 180 NOT NULL;--> statement-breakpoint
ALTER TABLE "racing_tables" ADD COLUMN "betting_close_before_start_seconds" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "racing_bet_selections" ADD CONSTRAINT "racing_bet_selections_bet_id_racing_bets_id_fk" FOREIGN KEY ("bet_id") REFERENCES "public"."racing_bets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "racing_bet_selections" ADD CONSTRAINT "racing_bet_selections_horse_id_racing_horses_id_fk" FOREIGN KEY ("horse_id") REFERENCES "public"."racing_horses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "racing_bet_selections" ADD CONSTRAINT "racing_bet_selections_race_entry_fk" FOREIGN KEY ("race_id","race_entry_id","horse_id") REFERENCES "public"."racing_race_entries"("race_id","id","horse_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "racing_bet_selections_bet_order_unique" ON "racing_bet_selections" USING btree ("bet_id","selection_order");--> statement-breakpoint
CREATE UNIQUE INDEX "racing_bet_selections_bet_entry_unique" ON "racing_bet_selections" USING btree ("bet_id","race_entry_id");--> statement-breakpoint
CREATE INDEX "racing_bet_selections_bet_id_idx" ON "racing_bet_selections" USING btree ("bet_id");--> statement-breakpoint
CREATE INDEX "racing_bet_selections_race_id_idx" ON "racing_bet_selections" USING btree ("race_id");--> statement-breakpoint
CREATE INDEX "racing_bet_selections_race_entry_id_idx" ON "racing_bet_selections" USING btree ("race_entry_id");--> statement-breakpoint
CREATE INDEX "racing_races_table_scheduled_start_idx" ON "racing_races" USING btree ("table_id","scheduled_start_at");--> statement-breakpoint
ALTER TABLE "racing_bets" ADD CONSTRAINT "racing_bets_type_check" CHECK ("racing_bets"."bet_type" in ('WIN', 'QUINELLA', 'EXACTA'));--> statement-breakpoint
ALTER TABLE "racing_races" ADD CONSTRAINT "racing_races_schedule_order_check" CHECK ((
        "racing_races"."scheduled_start_at" is null or
        "racing_races"."betting_closes_at" is null or
        "racing_races"."betting_closes_at" <= "racing_races"."scheduled_start_at"
      ));--> statement-breakpoint
ALTER TABLE "racing_races" ADD CONSTRAINT "racing_races_status_check" CHECK ("racing_races"."status" in (
        'WAITING',
        'BETTING',
        'LOCKING_BETS',
        'RUNNING',
        'FINISHING',
        'SETTLING',
        'SETTLED',
        'ROUND_END',
        'CANCELLED'
      ));--> statement-breakpoint
ALTER TABLE "racing_races" ADD CONSTRAINT "racing_races_phase_check" CHECK ("racing_races"."phase" in (
        'WAITING',
        'BETTING',
        'LOCKING_BETS',
        'RUNNING',
        'FINISHING',
        'SETTLING',
        'SETTLED',
        'ROUND_END',
        'CANCELLED'
      ));--> statement-breakpoint
ALTER TABLE "racing_tables" ADD CONSTRAINT "racing_tables_race_interval_check" CHECK ("racing_tables"."race_interval_seconds" > 0);--> statement-breakpoint
ALTER TABLE "racing_tables" ADD CONSTRAINT "racing_tables_betting_close_before_start_check" CHECK ("racing_tables"."betting_close_before_start_seconds" > 0 and "racing_tables"."betting_close_before_start_seconds" < "racing_tables"."race_interval_seconds");