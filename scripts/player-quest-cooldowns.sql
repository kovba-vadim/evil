-- Generated from the Payload PostgreSQL adapter schema. Apply only after review.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = public;
CREATE TABLE "player_quest_cooldowns" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"quest_id" integer NOT NULL,
	"completed_at" timestamp(3) with time zone NOT NULL,
	"cooldown_until" timestamp(3) with time zone NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"revision" varchar NOT NULL,
	"request_i_d" varchar NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);


ALTER TABLE "player_quest_cooldowns" ADD CONSTRAINT "player_quest_cooldowns_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "player_quest_cooldowns" ADD CONSTRAINT "player_quest_cooldowns_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX "player_quest_cooldowns_player_idx" ON "player_quest_cooldowns" USING btree ("player_id");

CREATE INDEX "player_quest_cooldowns_quest_idx" ON "player_quest_cooldowns" USING btree ("quest_id");

CREATE INDEX "player_quest_cooldowns_cooldown_until_idx" ON "player_quest_cooldowns" USING btree ("cooldown_until");

CREATE INDEX "player_quest_cooldowns_updated_at_idx" ON "player_quest_cooldowns" USING btree ("updated_at");

CREATE INDEX "player_quest_cooldowns_created_at_idx" ON "player_quest_cooldowns" USING btree ("created_at");

CREATE UNIQUE INDEX "player_quest_idx" ON "player_quest_cooldowns" USING btree ("player_id","quest_id");

COMMIT;
