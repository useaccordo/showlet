CREATE TABLE staff_users (id TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','member')), disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_seen TEXT NOT NULL);
CREATE TABLE playback_events (video_id TEXT NOT NULL, viewer_key TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY(video_id,viewer_key,day));
CREATE INDEX playback_day ON playback_events(day);
CREATE TABLE playback_daily (day TEXT NOT NULL, video_id TEXT NOT NULL, views INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day,video_id));
CREATE TRIGGER count_playback AFTER INSERT ON playback_events BEGIN
 INSERT INTO playback_daily(day,video_id,views) VALUES(NEW.day,NEW.video_id,1) ON CONFLICT(day,video_id) DO UPDATE SET views=views+1;
END;
CREATE TABLE admin_audit (id INTEGER PRIMARY KEY, actor TEXT NOT NULL, target TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
