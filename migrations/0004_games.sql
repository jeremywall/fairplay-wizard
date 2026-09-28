-- Saved games: the options used, who was present (in batting order), and the
-- fielding lineup. Only games with status 'final' count toward season stats
-- and the batting-order carry-over.

CREATE TABLE game (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES team (id) ON DELETE CASCADE,
  game_date TEXT NOT NULL, -- YYYY-MM-DD
  opponent TEXT,
  innings INTEGER NOT NULL,
  alignment_mode INTEGER NOT NULL CHECK (alignment_mode IN (9, 10)),
  pitcher_inning_limit INTEGER NOT NULL CHECK (pitcher_inning_limit IN (1, 2)),
  min_defensive_outs INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'final')),
  -- Set when the game is finalized.
  plate_appearances INTEGER,
  last_batter_player_id TEXT REFERENCES player (id) ON DELETE SET NULL,
  finalized_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX game_team_id_idx ON game (team_id, game_date);

-- Players present, in this game's batting order (1-based).
CREATE TABLE game_player (
  game_id TEXT NOT NULL REFERENCES game (id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES player (id) ON DELETE CASCADE,
  batting_position INTEGER NOT NULL,
  PRIMARY KEY (game_id, player_id)
);

-- One row per player per inning: a position id or 'BN'.
CREATE TABLE game_assignment (
  game_id TEXT NOT NULL REFERENCES game (id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES player (id) ON DELETE CASCADE,
  inning INTEGER NOT NULL, -- 1-based
  slot TEXT NOT NULL,
  PRIMARY KEY (game_id, player_id, inning)
);
