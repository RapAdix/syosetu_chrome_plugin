CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  daily_limit INTEGER NOT NULL DEFAULT 100,
  requests_today INTEGER NOT NULL DEFAULT 0,
  last_request_date TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS server_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Default model used when plugin is set to "server" (auto model on server)
INSERT OR IGNORE INTO server_config (key, value)
VALUES ('gemini_model', 'gemini-2.5-flash');
