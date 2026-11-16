-- Bài đăng Facebook/Threads: lịch đăng, bản nháp, bản đã duyệt.
-- Chạy file này một lần trong Console của D1 database "serene-content" (binding DB).
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'CHỮ THUẦN',
  body TEXT NOT NULL DEFAULT '',
  original_body TEXT,
  image TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  stt TEXT NOT NULL DEFAULT '',
  scheduled_at TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'NHÁP',
  post_url TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  posted_at TEXT,
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS posts_status_time ON posts(status, scheduled_at);

-- Mỗi bài có tối đa một mẫu: bản gốc (Claude viết) và bản Jackson sửa, để Claude học phong cách.
CREATE TABLE IF NOT EXISTS style_samples (
  post_id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  platform TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  original TEXT NOT NULL,
  edited TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  updated TEXT NOT NULL
);
