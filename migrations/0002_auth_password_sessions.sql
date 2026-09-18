-- Migration: 0002_auth_password_sessions.sql
-- Description: Add password fields, normalized email indexing, and sessions table for long-term tokens

-- 1. Add password columns and normalized email to users table
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN password_set_at TEXT;
ALTER TABLE users ADD COLUMN email_normalized TEXT;

-- 2. Backfill email_normalized for existing records and index
UPDATE users SET email_normalized = LOWER(TRIM(email)) WHERE email IS NOT NULL AND email_normalized IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_email_normalized ON users(email_normalized);

-- 3. Create sessions table for long-term refresh token tracking
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  user_agent TEXT,
  ip TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_hash ON sessions(refresh_token_hash);
