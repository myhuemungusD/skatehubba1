DROP TABLE IF EXISTS game_votes CASCADE;
DROP TABLE IF EXISTS game_turns CASCADE;
DROP TABLE IF EXISTS games CASCADE;

CREATE TABLE IF NOT EXISTS games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id varchar(128) NOT NULL,
  opponent_id varchar(128) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  current_turn_uid varchar(128),
  challenger_letters varchar(5) DEFAULT '',
  opponent_letters varchar(5) DEFAULT '',
  winner_id varchar(128),
  forfeit_reason varchar(50),
  current_turn_deadline timestamp,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  completed_at timestamp,
  CONSTRAINT valid_status CHECK (status IN ('pending', 'active', 'completed', 'forfeited'))
);

CREATE INDEX games_challenger_idx ON games(challenger_id);
CREATE INDEX games_opponent_idx ON games(opponent_id);
CREATE INDEX games_status_idx ON games(status);
CREATE INDEX games_deadline_idx ON games(current_turn_deadline);

CREATE TABLE IF NOT EXISTS game_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  uid varchar(128) NOT NULL,
  turn_number integer NOT NULL,
  turn_type varchar(10) NOT NULL CHECK (turn_type IN ('set', 'match')),
  video_url text NOT NULL,
  thumbnail_url text,
  trick_description text,
  judgment varchar(20),
  judged_at timestamp,
  judged_by varchar(128),
  deadline timestamp NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT unique_turn_number UNIQUE(game_id, turn_number)
);

CREATE INDEX game_turns_game_idx ON game_turns(game_id);
CREATE INDEX game_turns_uid_idx ON game_turns(uid);
CREATE INDEX game_turns_deadline_idx ON game_turns(deadline);
