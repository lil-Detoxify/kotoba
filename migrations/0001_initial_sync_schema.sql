-- Migration: 0001_initial_sync_schema.sql
-- Description: Create users, user_progress, review_events, and user_settings for KotoBud cloud sync.

-- 1. users: maps auth providers to KotoBud internal user IDs
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  auth_provider TEXT NOT NULL,
  provider_uid TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider ON users (auth_provider, provider_uid);

-- 2. user_progress: snapshot of per-word study state
CREATE TABLE IF NOT EXISTS user_progress (
  user_id TEXT NOT NULL,
  word_id TEXT NOT NULL,
  book_id TEXT,
  lesson_id TEXT,
  status TEXT NOT NULL,
  first_seen_at TEXT,
  last_reviewed_at TEXT,
  next_review_at TEXT,
  review_count INTEGER NOT NULL DEFAULT 0,
  lapse_count INTEGER NOT NULL DEFAULT 0,
  fsrs_card TEXT NOT NULL,
  is_difficult INTEGER NOT NULL DEFAULT 0,
  difficult_updated_at TEXT,
  is_ignored INTEGER NOT NULL DEFAULT 0,
  ignored_updated_at TEXT,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, word_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_progress_updated ON user_progress (user_id, updated_at);

-- 3. review_events: immutable, append-only log of review attempts
CREATE TABLE IF NOT EXISTS review_events (
  event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  word_id TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  rating INTEGER NOT NULL,
  response_time INTEGER NOT NULL DEFAULT 0,
  study_mode TEXT NOT NULL,
  device_id TEXT,
  quiz TEXT,
  client_created_at TEXT NOT NULL,
  server_received_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_review_events_user_word ON review_events (user_id, word_id, reviewed_at ASC);

-- 4. user_settings: user-level synchronization state
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  current_book_id TEXT,
  last_studied_book_id TEXT,
  last_studied_lesson_id TEXT,
  last_studied_word_id TEXT,
  last_studied_updated_at TEXT,
  pronunciation_voice TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
