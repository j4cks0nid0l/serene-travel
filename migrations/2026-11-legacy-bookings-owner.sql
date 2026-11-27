-- Chỉ cần chạy trên database BOOKINGS (serene-bookings) đã tạo trước khi có cột owner.
-- Database mới đã có đủ cột từ schema-bookings.sql. Nếu báo "duplicate column name" thì bỏ qua câu đó.
ALTER TABLE customers ADD COLUMN owner TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN owner TEXT NOT NULL DEFAULT '';
