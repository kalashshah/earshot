-- Per-clip extraction (Nemotron Lightning) + the MemoryHQ memories it wrote, so forgetting a clip forgets them too.
ALTER TABLE recordings ADD COLUMN entities TEXT;     -- JSON {people: [{name, org}], orgs: [string]}
ALTER TABLE recordings ADD COLUMN memory_ids TEXT;   -- JSON [memory id]

-- Commitments heard in conversation. owner = 'you' → Earshot drafts the follow-up.
CREATE TABLE actions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  recording_id TEXT NOT NULL,
  owner TEXT NOT NULL,              -- 'you' or the other person's name
  counterpart TEXT,                 -- who it's owed to / owed by
  what TEXT NOT NULL,
  due TEXT,                         -- free text as said ("Friday"), resolved to a date when possible
  draft TEXT,                       -- follow-up message drafted by Nemotron Super
  status TEXT NOT NULL,             -- open | done | dismissed
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_actions_user_status ON actions (user_id, status, created_at DESC);

-- Morning brief written by Nemotron Ultra over the whole previous day + Tavily news.
CREATE TABLE briefs (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,                -- YYYY-MM-DD in the user's timezone
  content TEXT NOT NULL,            -- markdown
  sources TEXT NOT NULL,            -- JSON [{n, title, url}]
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);

-- Every model call, so the dashboard and the eval can show real dollars per day.
CREATE TABLE usage (
  ts INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  model TEXT NOT NULL,
  purpose TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_usage_user_ts ON usage (user_id, ts);
