-- Teams, the coaches who can access them, and their rosters.

CREATE TABLE team (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  innings_per_game INTEGER NOT NULL DEFAULT 6,
  -- Minimum defensive outs each present player must play per game (league rules vary).
  min_defensive_outs INTEGER NOT NULL DEFAULT 6,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE team_coach (
  team_id TEXT NOT NULL REFERENCES team (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('head', 'assistant')),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX team_coach_user_id_idx ON team_coach (user_id);

CREATE TABLE player (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES team (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  jersey_number TEXT,
  -- Position in the team's fixed batting order (lower bats earlier).
  batting_slot INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX player_team_id_idx ON player (team_id);
