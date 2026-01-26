CREATE TABLE IF NOT EXISTS "games" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "challenger_id" varchar(128) NOT NULL,
  "opponent_id" varchar(128) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "current_turn_uid" varchar(128),
  "challenger_letters" varchar(5) DEFAULT '',
  "opponent_letters" varchar(5) DEFAULT '',
  "winner_id" varchar(128),
  "turn_time_limit" integer DEFAULT 86400,
  "last_turn_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp,
  "completed_at" timestamp
);

CREATE INDEX IF NOT EXISTS "games_challenger_idx" ON "games" ("challenger_id");
CREATE INDEX IF NOT EXISTS "games_opponent_idx" ON "games" ("opponent_id");
CREATE INDEX IF NOT EXISTS "games_status_idx" ON "games" ("status");

CREATE TABLE IF NOT EXISTS "game_turns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "game_id" uuid NOT NULL REFERENCES "games"("id") ON DELETE CASCADE,
  "uid" varchar(128) NOT NULL,
  "turn_number" integer NOT NULL,
  "turn_type" varchar(10) NOT NULL,
  "video_url" text NOT NULL,
  "thumbnail_url" text,
  "trick_description" text,
  "judgment" varchar(20),
  "is_successful" boolean,
  "vote_count" integer DEFAULT 0,
  "upvotes" integer DEFAULT 0,
  "downvotes" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "judged_at" timestamp
);

CREATE INDEX IF NOT EXISTS "game_turns_game_idx" ON "game_turns" ("game_id");
CREATE INDEX IF NOT EXISTS "game_turns_uid_idx" ON "game_turns" ("uid");
CREATE INDEX IF NOT EXISTS "game_turns_number_idx" ON "game_turns" ("turn_number");

CREATE TABLE IF NOT EXISTS "game_votes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "turn_id" uuid NOT NULL REFERENCES "game_turns"("id") ON DELETE CASCADE,
  "voter_id" varchar(128) NOT NULL,
  "vote" varchar(10) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  UNIQUE("turn_id", "voter_id")
);

CREATE INDEX IF NOT EXISTS "game_votes_turn_idx" ON "game_votes" ("turn_id");
CREATE INDEX IF NOT EXISTS "game_votes_voter_idx" ON "game_votes" ("voter_id");
