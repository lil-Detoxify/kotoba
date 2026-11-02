-- Explicit account content snapshot. Review state remains in the existing tables.
CREATE TABLE IF NOT EXISTS personal_library_backups (
  user_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
