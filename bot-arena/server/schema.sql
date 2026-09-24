CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL,          -- minified and scrambled in the submitter's browser
  created_at INTEGER NOT NULL,
  ip_hash TEXT NOT NULL        -- salted hash, only used for rate limiting
);
CREATE UNIQUE INDEX IF NOT EXISTS bots_name ON bots (name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS bots_created ON bots (created_at DESC);
CREATE INDEX IF NOT EXISTS bots_ip ON bots (ip_hash, created_at);
