ALTER TABLE "racing_races" ADD COLUMN "paused_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "racing_races"
SET "paused_at" = "updated_at"
WHERE "phase" NOT IN ('ROUND_END', 'CANCELLED');
