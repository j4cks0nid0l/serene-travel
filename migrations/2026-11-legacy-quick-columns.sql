-- Chỉ cần chạy trên database đã tạo trước khi bảng quick_* có cột sec/grp (bản cũ thêm cột bằng ALTER lúc chạy).
-- Database mới đã có đủ cột từ schema.sql, không cần chạy file này.
-- Chạy từng câu lệnh trong Console của D1 (database "serene-content"); nếu báo "duplicate column name" thì bỏ qua câu đó.
ALTER TABLE quick_msgs ADD COLUMN sec TEXT NOT NULL DEFAULT '';
-- Chuyển nhóm cũ lên tầng Mục (chỉ chạy một lần, ngay sau câu ALTER ở trên thành công):
UPDATE quick_msgs SET sec=grp, grp='' WHERE grp<>'';
ALTER TABLE quick_photos ADD COLUMN sec TEXT NOT NULL DEFAULT '';
ALTER TABLE quick_photos ADD COLUMN grp TEXT NOT NULL DEFAULT '';
