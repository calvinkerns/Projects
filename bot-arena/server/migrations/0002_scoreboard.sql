-- Adds the scoreboard to a database created before it existed. The oldest
-- existing bot starts at #1 so the board isn't empty.
ALTER TABLE bots ADD COLUMN rank INTEGER;
ALTER TABLE bots ADD COLUMN ladder TEXT NOT NULL DEFAULT '[]';
UPDATE bots SET rank = 1 WHERE id = (SELECT id FROM bots ORDER BY created_at LIMIT 1);
