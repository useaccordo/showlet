ALTER TABLE upload_sessions ADD COLUMN transcript TEXT;
ALTER TABLE upload_sessions ADD COLUMN public_acknowledged_at TEXT;
ALTER TABLE videos ADD COLUMN transcript TEXT;
CREATE TABLE ai_usage (
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  units INTEGER NOT NULL,
  PRIMARY KEY(day,kind)
);
