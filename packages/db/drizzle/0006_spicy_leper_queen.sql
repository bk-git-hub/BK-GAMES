ALTER TABLE "racing_tables" DROP CONSTRAINT "racing_tables_betting_close_before_start_check";--> statement-breakpoint
ALTER TABLE "racing_tables" ALTER COLUMN "race_interval_seconds" SET DEFAULT 240;--> statement-breakpoint
UPDATE "racing_tables"
SET "race_interval_seconds" = 240
WHERE "betting_timeout_seconds" + "betting_close_before_start_seconds" >= "race_interval_seconds";--> statement-breakpoint
ALTER TABLE "racing_tables" ADD CONSTRAINT "racing_tables_betting_close_before_start_check" CHECK ("racing_tables"."betting_close_before_start_seconds" > 0 and "racing_tables"."betting_timeout_seconds" + "racing_tables"."betting_close_before_start_seconds" < "racing_tables"."race_interval_seconds");
