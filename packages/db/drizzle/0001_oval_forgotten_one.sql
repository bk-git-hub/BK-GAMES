ALTER TABLE "blackjack_tables" ADD COLUMN "code" text;--> statement-breakpoint
UPDATE "blackjack_tables" SET "code" = 'table-' || "id"::text WHERE "code" IS NULL;--> statement-breakpoint
ALTER TABLE "blackjack_tables" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "blackjack_tables_code_unique" ON "blackjack_tables" USING btree ("code");--> statement-breakpoint
ALTER TABLE "blackjack_tables" ADD CONSTRAINT "blackjack_tables_code_not_empty" CHECK (length(trim("blackjack_tables"."code")) > 0);
