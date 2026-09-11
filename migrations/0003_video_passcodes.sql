ALTER TABLE videos ADD COLUMN passcode_hash TEXT;
CREATE TABLE viewer_attempts (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX viewer_attempts_expiry ON viewer_attempts(expires_at);
