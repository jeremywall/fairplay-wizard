-- Defensive alignment used when 10 or more players are present:
-- 9 positions (3 outfielders) or 10 positions (4 outfielders).
ALTER TABLE team ADD COLUMN alignment_mode INTEGER NOT NULL DEFAULT 10 CHECK (alignment_mode IN (9, 10));
