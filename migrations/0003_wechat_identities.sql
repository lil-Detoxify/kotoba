-- A KotoBud account may have both email and WeChat credentials.
CREATE TABLE IF NOT EXISTS auth_identities (
  provider TEXT NOT NULL,
  provider_uid TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (provider, provider_uid),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities(user_id);

-- Website OAuth completes in a browser; the initiating Web or Windows client
-- redeems the result with its private verifier. No token travels in a URL.
CREATE TABLE IF NOT EXISTS wechat_auth_attempts (
  id TEXT PRIMARY KEY,
  verifier_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,
  target_user_id TEXT,
  user_id TEXT,
  error_code TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (target_user_id) REFERENCES users(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_wechat_auth_attempts_expires ON wechat_auth_attempts(expires_at);
