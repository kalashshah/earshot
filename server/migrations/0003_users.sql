-- Accounts come from the website (better-auth lives in earshot-web); this is Earshot's view of each user.
CREATE TABLE users (
  id TEXT PRIMARY KEY,                 -- better-auth user id
  email TEXT,
  name TEXT,                           -- what people call them: tells Nemotron which speaker is "you"
  tz TEXT NOT NULL DEFAULT 'UTC',      -- IANA timezone, for "yesterday" and the 07:00 brief
  retention_days INTEGER NOT NULL DEFAULT 30,
  daily_usd_cap REAL NOT NULL DEFAULT 1,
  memoryhq_workspace TEXT,             -- one isolated MemoryHQ workspace per user, provisioned on first visit
  memoryhq_key TEXT,
  created_at INTEGER NOT NULL
);

-- A paired iPhone (and its watch). Only the token's hash is stored.
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER
);
CREATE INDEX idx_devices_user ON devices (user_id);

-- Short-lived codes shown on the website, typed into the iPhone app.
CREATE TABLE pair_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
