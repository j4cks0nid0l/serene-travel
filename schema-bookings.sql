CREATE TABLE IF NOT EXISTS bookings (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, data TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS booking_units (name TEXT PRIMARY KEY, created TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS booking_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'retail', note TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, updated TEXT NOT NULL, owner TEXT NOT NULL DEFAULT '');

CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', need TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new', booking_id TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, updated TEXT NOT NULL, owner TEXT NOT NULL DEFAULT '');

-- Tài khoản nhân viên, phiên đăng nhập của nhân viên và nhật ký thao tác.
-- Ứng dụng tự tạo các bảng này khi cần, nên không bắt buộc chạy tay. Giữ ở đây để tham khảo.
CREATE TABLE IF NOT EXISTS staff (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL, perms TEXT NOT NULL, hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created TEXT NOT NULL, updated TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS staff_sessions (token TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires INTEGER NOT NULL, staff_id TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL, actor_name TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS audit_at ON audit_log(at);
