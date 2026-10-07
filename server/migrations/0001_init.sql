CREATE TABLE recordings (
  id TEXT PRIMARY KEY,              -- UUID minted on the watch: retried uploads are idempotent
  user_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,      -- ms epoch
  duration_ms INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  status TEXT NOT NULL,             -- queued | done | empty | failed
  title TEXT,
  summary TEXT,
  transcript TEXT,
  memories_added INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_recordings_user_started ON recordings (user_id, started_at DESC);
