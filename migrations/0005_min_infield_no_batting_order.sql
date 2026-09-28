-- Minimum infield innings (HR-6) becomes a team setting, stored on each game
-- as used. Batting order is no longer tracked.

ALTER TABLE team ADD COLUMN min_infield_innings INTEGER NOT NULL DEFAULT 2;
ALTER TABLE game ADD COLUMN min_infield_innings INTEGER NOT NULL DEFAULT 2;

ALTER TABLE player RENAME COLUMN batting_slot TO roster_order;
ALTER TABLE game_player RENAME COLUMN batting_position TO lineup_order;
ALTER TABLE game DROP COLUMN plate_appearances;

-- game.last_batter_player_id is no longer used. SQLite can't drop a column
-- that has a foreign key, so it stays, always NULL.
UPDATE game SET last_batter_player_id = NULL;
