CREATE TABLE videos (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, r2_key TEXT NOT NULL UNIQUE,
 thumb_key TEXT, mime TEXT NOT NULL, size_bytes INTEGER NOT NULL CHECK(size_bytes>=0),
 duration_sec REAL NOT NULL CHECK(duration_sec>=0), created_by TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 views INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, storage TEXT NOT NULL DEFAULT 'r2'
);
CREATE INDEX videos_owner_created ON videos(created_by,created_at DESC) WHERE deleted_at IS NULL;
CREATE TABLE upload_sessions (
 id TEXT PRIMARY KEY, video_id TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL,
 title TEXT NOT NULL, r2_key TEXT NOT NULL UNIQUE, thumb_key TEXT NOT NULL UNIQUE,
 mime TEXT NOT NULL, expected_size_bytes INTEGER NOT NULL, duration_sec REAL NOT NULL,
 multipart_upload_id TEXT, state TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), expires_at TEXT NOT NULL
);
CREATE INDEX upload_sessions_expiry ON upload_sessions(expires_at);
