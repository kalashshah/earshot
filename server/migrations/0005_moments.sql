-- Dated things heard in conversation (or asked for on the watch): birthdays, anniversaries, trips, deadlines.
-- The phone turns each into local notifications `lead_days` before, e.g. [7, 1] = a week and a day ahead.
CREATE TABLE moments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  recording_id TEXT,                -- null when asked for directly ("remind me…")
  dedupe TEXT NOT NULL,             -- kind|date|person: the same anniversary heard twice is one moment
  kind TEXT NOT NULL,               -- birthday | anniversary | event | trip | deadline | appointment | other
  title TEXT NOT NULL,
  person TEXT,
  date TEXT NOT NULL,               -- YYYY-MM-DD in the user's timezone
  time TEXT,                        -- HH:MM, for same-day reminders
  yearly INTEGER NOT NULL DEFAULT 0,
  prep TEXT,                        -- what to do beforehand: "get Sara a gift"
  lead_days TEXT NOT NULL,          -- JSON [days before]
  ideas TEXT,                       -- gift / prep ideas from what was said, written ~2 weeks ahead
  ideas_for TEXT,                   -- the occurrence `ideas` were written for (yearly ones get fresh ideas)
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_moments_dedupe ON moments (user_id, dedupe);

-- Promise due dates resolved to a day ("by Friday" said on a Wednesday → that Friday), for reminders.
ALTER TABLE actions ADD COLUMN due_date TEXT;
