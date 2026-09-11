ALTER TABLE videos ADD COLUMN media_purged_at TEXT;
CREATE INDEX videos_pending_cleanup ON videos(deleted_at) WHERE deleted_at IS NOT NULL AND media_purged_at IS NULL;
