-- Things to be reminded of on a schedule or at a place, asked for on the watch.
--   kind 'time':  repeats on `days` at `time`; with a `question`, each run gets a fresh `answer` ("what do I still owe people?")
--   kind 'place': fires when the phone arrives at (or leaves) `place`; the phone resolves it, so location stays on the device
CREATE TABLE routines (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,               -- time | place
  title TEXT NOT NULL,
  days TEXT,                        -- JSON ["mon", "fri"]; [] = every day
  time TEXT,                        -- HH:MM local
  question TEXT,
  answer TEXT,
  answer_for TEXT,                  -- the run (YYYY-MM-DDTHH:MM) `answer` was written for
  place TEXT,                       -- "grocery store", "home", "Priya's office"
  leave INTEGER NOT NULL DEFAULT 0, -- 1 = on leaving instead of arriving
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_routines_user ON routines (user_id);

-- "I'll grab the badge next time I'm at the office" → a place reminder until the promise is done.
ALTER TABLE actions ADD COLUMN place TEXT;
