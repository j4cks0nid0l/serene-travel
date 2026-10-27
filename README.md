# Serene Travel V2.4

Bản phát triển có website công khai và trang quản trị riêng tại `/admin/`.
Giữ nguyên các file V2.3 trở về trước. File `../serene-travel-v2.4.html` dùng để duyệt giao diện, không cung cấp đăng nhập hoặc lưu dữ liệu máy chủ khi mở trực tiếp.

## Đã thực hiện

- Nút góc phải là **Liên hệ**, mở phần liên hệ riêng. Xóa mục Liên hệ trùng trong menu.
- **Combo Vinpearl** nằm sau Di chuyển và có trang riêng.
- Mỗi mục con có trang dịch vụ riêng, không tự bổ sung giá hoặc nội dung dịch vụ.
- Khách chỉ đọc bài đã đăng; không còn trình soạn bài công khai hoặc bản nháp lưu trên trình duyệt khách.
- Một tài khoản quản trị: **serenetravelvn@gmail.com**. Không mở đăng ký tài khoản.
- Chỉnh trang chủ, giới thiệu, ảnh đại diện, thông tin công ty/liên hệ, mọi trang dịch vụ và cẩm nang.
- Lưu nháp, xem trước, đăng và gỡ bài; bản nháp không thay đổi bản đã đăng.
- Tải ảnh JPG/PNG/WebP tối đa 5 MB, lưu qua Cloudflare R2.
- Ảnh hiện tại được giữ; có thể thay sau trong quản trị. Không điền địa chỉ/email công ty khi chưa được xác nhận. Email đăng nhập không tự dùng làm email liên hệ công ty.

## Kiến trúc

- GitHub: lưu mã nguồn. Không cần bật GitHub Pages.
- Cloudflare Pages: website và Pages Functions qua `public/_worker.js`.
- D1, binding **DB**: nội dung nháp/đã đăng, phiên đăng nhập và giới hạn thử mật khẩu.
- R2, binding **MEDIA**: hình ảnh.
- Secret **ADMIN_PASSWORD_HASH**: mật khẩu băm PBKDF2-SHA256, salt ngẫu nhiên; không đưa vào HTML hoặc Git.
- Phiên đăng nhập 8 giờ, cookie HttpOnly/SameSite=Strict/Secure trên HTTPS, kiểm tra Origin và mã CSRF cho thay đổi dữ liệu.
- Không có trình theo dõi và không gửi email tự động. Biểu mẫu khách vẫn soạn nội dung để gửi qua Zalo, không tự lưu yêu cầu vào máy chủ.

## Đưa lên GitHub và Cloudflare

1. Đưa **nội dung thư mục này** lên một repository GitHub, nên dùng repository riêng tư. Giữ `.gitignore`; không đưa `.dev.vars`, `node_modules`, `.wrangler` hay mật khẩu lên Git.
2. Tạo Cloudflare D1 database, ví dụ `serene-content`; chạy `schema.sql`, rồi `seed.sql` trên database đó. `seed.sql` chỉ thêm nội dung gốc chưa tồn tại và không ghi đè nội dung bạn đã sửa.
3. Tạo R2 bucket, ví dụ `serene-images`.
4. Tạo Cloudflare Pages project từ repository GitHub. Build command để trống, output directory là **public**. Nếu repository chứa cả thư mục cha, đặt root directory là `serene-travel-v2.4`.
5. Trong Pages Settings → Bindings, gắn D1 vào tên **DB**, R2 vào tên **MEDIA**. Tên viết hoa phải đúng.
6. Trên máy, chạy `node scripts/credentials.mjs`. Công cụ tạo mật khẩu ngẫu nhiên và hash. Lưu mật khẩu vào trình quản lý mật khẩu. Không gửi mật khẩu vào chat.
7. Đặt giá trị hash vừa tạo vào **Secret** có tên `ADMIN_PASSWORD_HASH` trong Cloudflare Pages, tuyệt đối không đặt trong build command hay public file. Chỉ email đã nêu được đăng nhập. Chạy lại công cụ sẽ tạo mật khẩu/hash khác.
8. Redeploy để bindings và secret có hiệu lực. Dùng địa chỉ `https://<project>.pages.dev`, chưa cần mua tên miền.
9. Mở `/admin/`, đăng nhập; thử lưu nháp rồi xem bằng cửa sổ ẩn danh để xác nhận bản nháp không hiện. Đăng một nội dung kiểm tra, xác nhận website cập nhật, rồi gỡ bài thử đó.
10. Thử tải ảnh và đăng xuất. Trước khi dùng thật, kiểm tra lại toàn bộ luồng trên Cloudflare; bản này chưa được triển khai vào tài khoản của bạn.

Cloudflare cấu hình qua dashboard là đủ. `wrangler.example.toml` là phương án CLI thay thế; nếu dùng, sao chép thành `wrangler.toml` và thay UUID toàn số 0 bằng ID database thực tế. Không deploy với UUID mẫu.

## Chạy và kiểm tra trên máy

Yêu cầu Node.js 24 trở lên cho máy chủ kiểm tra SQLite. Cài thư viện bằng `pnpm install` (có lockfile).

```sh
node --test tests/*.test.mjs
node scripts/credentials.mjs
```

Để dùng máy chủ kiểm tra trên máy, tạo file `.dev.vars` (đã được bỏ qua bởi Git) chứa `ADMIN_PASSWORD_HASH=<salt:hash>` từ công cụ credentials, rồi:

```sh
node scripts/preview-server.mjs
```

Mở `http://127.0.0.1:8788`, quản trị tại `/admin/`. Dữ liệu này chỉ nằm trong `.wrangler`, độc lập với Cloudflare.

Máy chủ kiểm tra dùng SQLite và bộ chuyển đổi giao diện D1/R2 để thử luồng ứng dụng; không thay thế kiểm tra trên nền tảng Cloudflare. Trình giả lập workerd trên máy Windows hiện bị lỗi khởi động trong quá trình kiểm tra. Không thay đổi thiết lập Windows để khắc phục trong phạm vi lần này.

## Kết quả kiểm tra

- Kiểm thử máy chủ: đăng nhập sai/đúng, giới hạn thử mật khẩu, chặn người chưa đăng nhập, kiểm tra Origin/CSRF, đăng xuất và hủy phiên.
- Phân biệt nháp/đã đăng/gỡ bài; bản nháp mới không làm đổi bản công khai.
- Lọc nội dung HTML, từ chối URL/loại ảnh không hợp lệ.
- Kiểm tra trình duyệt: đăng nhập, sửa trang dịch vụ, lưu nháp, đăng, sửa thông tin công ty, tải ảnh và hiển thị ảnh công khai.
- Kiểm tra giao diện 360, 390, 768, 1024 và 1440 px, không tràn ngang.
- Các kiểm tra thực hiện trên máy; chưa kiểm tra tài khoản và hạ tầng Cloudflare của bạn.

## Sao lưu và vận hành

Nút **Tải bản sao** tải nội dung mục đang sửa. Sao lưu toàn website cần sao lưu cả D1 và R2; không chỉ repository GitHub vì nội dung được lưu trong Cloudflare.

Khi cần đổi mật khẩu: tạo hash mới, thay Secret trên Cloudflare, redeploy và chạy `DELETE FROM sessions;` trên D1 để hủy các phiên còn hiệu lực. Không có luồng khôi phục mật khẩu qua email trong bản một quản trị viên này.

Trình soạn hỗ trợ nội dung văn bản, tiêu đề, đậm/nghiêng/gạch chân, danh sách, liên kết và ảnh. Dán từ Word hiện lấy phần chữ để tránh định dạng lỗi; không nhập nguyên file `.docx`. Phiên bản này chưa có phân quyền nhân viên, SEO kết xuất phía máy chủ hoặc lịch đăng tự động.

Tài liệu nền tảng:
- https://developers.cloudflare.com/pages/functions/advanced-mode/
- https://developers.cloudflare.com/pages/functions/bindings/
- https://developers.cloudflare.com/pages/configuration/git-integration/


## V2.4.1: giao diện đăng nhập

Làm mới màn hình đăng nhập, bổ sung hiện/ẩn mật khẩu và sửa đường dẫn CSS/JS tương đối. File `../serene-travel-admin-preview.html` là bản duyệt độc lập, không cần mật khẩu, không gửi nội dung lên mạng. Mã mô phỏng chỉ nằm trong file xem thử ngoài thư mục public; trang quản trị triển khai vẫn yêu cầu đăng nhập qua API.
