CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  issue_url TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
