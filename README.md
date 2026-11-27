# Serene Travel

Website công khai và trang quản trị tại `/admin/`.
File mở trực tiếp bằng trình duyệt (file://) chỉ để xem giao diện: không đăng nhập được và không lưu dữ liệu.

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
2. Tạo D1 database `serene-content` (binding **DB**). Trong tab Console, chạy lần lượt `schema.sql`, `schema-posts.sql`, rồi `seed.sql`.
   Tạo D1 database `serene-bookings` (binding **BOOKINGS**) và chạy `schema-bookings.sql`. Đây là toàn bộ bảng cần có; `migrations/2026-11-hotels-seed.sql` thêm 12 khách sạn vào dữ liệu quản trị (chạy một lần trên serene-content, cho cả database mới). Các file `migrations/2026-11-legacy-*.sql` chỉ dùng khi nâng cấp database tạo từ bản cũ.
3. Tạo R2 bucket, ví dụ `serene-images`.
4. Tạo Cloudflare Pages project từ repository GitHub. Build command để trống, output directory là **public**. Nếu repository chứa cả thư mục cha, đặt root directory là `serene-travel-v2.4`.
5. Trong Pages Settings → Bindings, gắn D1 `serene-content` vào tên **DB**, D1 `serene-bookings` vào tên **BOOKINGS**, R2 vào tên **MEDIA**. Tên viết hoa phải đúng.
6. Trên máy, đặt email của Chủ rồi chạy công cụ tạo mật khẩu. PowerShell: `$env:ADMIN_EMAIL = "email-cua-chu@..."; node scripts/credentials.mjs`. Công cụ tạo mật khẩu ngẫu nhiên và hash. Lưu mật khẩu vào trình quản lý mật khẩu. Không gửi mật khẩu vào chat.
7. Trong Cloudflare Pages → Settings → Variables and Secrets: thêm **Secret** `ADMIN_PASSWORD_HASH` với giá trị hash vừa tạo, và **Variable** `ADMIN_EMAIL` với đúng email đã dùng ở bước 6. Không đặt hash hay email trong build command hay file public. Chạy lại công cụ sẽ tạo mật khẩu/hash khác.
8. Redeploy để bindings và secret có hiệu lực. Dùng địa chỉ `https://<project>.pages.dev`, chưa cần mua tên miền.
9. Mở `/admin/`, đăng nhập; thử lưu nháp rồi xem bằng cửa sổ ẩn danh để xác nhận bản nháp không hiện. Đăng một nội dung kiểm tra, xác nhận website cập nhật, rồi gỡ bài thử đó.
10. Thử tải ảnh và đăng xuất. Trước khi dùng thật, kiểm tra lại toàn bộ luồng trên Cloudflare; bản này chưa được triển khai vào tài khoản của bạn.

Cloudflare cấu hình qua dashboard là đủ. `wrangler.example.toml` là phương án CLI thay thế; nếu dùng, sao chép thành `wrangler.toml` và thay UUID toàn số 0 bằng ID database thực tế. Không deploy với UUID mẫu.

## Chạy và kiểm tra trên máy

Yêu cầu Node.js 24 trở lên cho máy chủ kiểm tra SQLite. Cài thư viện bằng `pnpm install` (có lockfile).

```sh
npm run check   # kiểm tra cú pháp mọi file JavaScript
npm test        # test máy chủ và kiểm tra tĩnh giao diện
npm run credentials
```

Để dùng máy chủ kiểm tra trên máy, tạo file `.dev.vars` (đã được bỏ qua bởi Git) chứa `ADMIN_PASSWORD_HASH=<salt:hash>` và `ADMIN_EMAIL=<email Chủ>`, rồi:

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

## Quản lý booking (/admin/booking)

Đơn hàng được lưu trong một cơ sở dữ liệu D1 riêng tên `serene-bookings`, tách hẳn khỏi nội dung website. Mỗi đơn là một dòng trong bảng `bookings` (xem `schema-bookings.sql`), nên sửa hoặc xóa đơn này không ảnh hưởng đơn khác.

Cài đặt trên Cloudflare:
1. Tạo D1 database `serene-bookings`, chạy nội dung `schema-bookings.sql` trong tab Console.
2. Trong project Pages, mục Settings > Bindings, thêm D1 binding tên `BOOKINGS` trỏ tới database trên.
3. Deploy lại. Nếu thiếu binding, trang booking báo lỗi 503 thay vì lưu sai chỗ.

Biến `JSONBIN_KEY` và `JSONBIN_BIN_ID` không còn được dùng và có thể xóa. Trang booking có nút tải bảng đơn hàng dạng CSV (tab Thống kê) để mở bằng Excel hoặc Google Sheets.

Đơn vị tự thêm (ví dụ "suất", "bàn") lưu trong bảng `booking_units` của cùng database, nên dùng được ở mọi máy. Nếu database tạo từ trước, chạy thêm lệnh `CREATE TABLE IF NOT EXISTS booking_units (name TEXT PRIMARY KEY, created TEXT NOT NULL);` trong Console của D1.

Tab Thiết lập của trang booking: quản lý đơn vị tự thêm, ghi chú cuối phiếu A5 (lưu trong bảng `booking_settings`) và tải CSV. Nếu database tạo từ trước, chạy thêm: `CREATE TABLE IF NOT EXISTS booking_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`

## Quản lý bài đăng (/admin/bai-dang), giai đoạn 1

Sau khi đăng nhập ở `/admin/`, màn hình đầu có ba khu: Quản lý web, Booking, Bài đăng. Nút "Chọn khu" ở đầu trang đưa về màn hình này. Địa chỉ `/admin/#web` mở thẳng khu Quản lý web.

Trang Bài đăng dùng chung tài khoản đăng nhập của trang quản trị. Dữ liệu nằm trong database `serene-content` (binding `DB`), hai bảng `posts` và `style_samples` định nghĩa trong `schema-posts.sql`. Không cần binding hay Secret mới.

Cài đặt trên Cloudflare:
1. Mở D1 database `serene-content`, tab Console, dán nội dung `schema-posts.sql` rồi chạy.
2. Deploy lại. Nếu chưa chạy bước 1, trang Bài đăng báo lỗi 503 và nêu rõ tên file cần chạy.

Giai đoạn 1 làm được: danh sách bài theo trạng thái (Chờ duyệt, Đã hẹn giờ, Đã đăng, Lỗi), thêm bài, sửa chữ, gắn ảnh (tự thu nhỏ khi lớn hơn 1,5 MB, lưu qua R2), hẹn giờ bằng cách bấm giờ trong hộp chọn (giờ phải cách hiện tại ít nhất 5 phút), bỏ hẹn giờ, đánh dấu đã đăng, sao chép nội dung. Giờ đăng lưu theo giờ Việt Nam (UTC+7), dạng `YYYY-MM-DD HH:mm`.

Khi bài do Claude viết được gửi vào (trường `from_claude`), bản gốc được giữ lại. Mỗi lần Jackson sửa bài, hoặc duyệt không sửa, hệ thống lưu một dòng trong `style_samples` để Claude học phong cách. Bài tự thêm bằng tay không tạo mẫu.

Chưa làm ở giai đoạn này: tự đăng lên Facebook (nối với Make), Claude đọc và ghi bài qua mã riêng, viết bài từ ảnh. Bài "Đã hẹn giờ" hiện chỉ được lưu lịch.

### Đăng thẳng đúng giờ (không hẹn giờ trong Business Suite)

Mỗi phút, Cloudflare Worker `workers/clock` gọi `POST /api/machine/tick` (khóa riêng, scope `clock`). Trang web tìm bài "Đã hẹn giờ" đã tới giờ, đổi sang "Đang đăng" rồi gửi bài sang webhook của Make (biến `MAKE_WEBHOOK_URL`). Make đăng thẳng lên Page rồi báo kết quả về `/api/machine/result/{id}`. Bài quá giờ hơn 60 phút, hoặc gửi Make quá 15 phút chưa có kết quả, chuyển sang "Lỗi" và không tự đăng lại để tránh đăng đôi.

## Sửa bài, đổi giờ và báo cáo học văn
- Bài chờ duyệt hoặc lỗi: ô nội dung khóa sẵn, bấm "Sửa bài" để sửa, rồi "Lưu sửa" hoặc "Hủy sửa".
- Bài đã hẹn giờ là bài đã duyệt nên không sửa nội dung. Chỉ có nút "Đổi giờ" (giờ mới cách hiện tại ít nhất 5 phút, không đổi được khi bài sắp đến giờ đăng).
- Khi lưu hoặc hẹn giờ một bài Claude viết mà nội dung đã bị sửa, trang hiện "Báo cáo sửa bài" (bản gốc và bản đã sửa) kèm nút sao chép để dán cho Claude học cách hành văn.

## Cấu trúc mã nguồn

- `public/`: website công khai (`index.html`, `home.js`, `site.js`), trang quản trị (`admin/`), trang sales (`sales/`), ảnh và dữ liệu mặc định.
- `public/_worker.js/`: mã máy chủ theo chế độ Pages "_worker.js directory". `index.js` là điểm vào; các module theo chức năng: `core.js`, `content.js`, `auth.js`, `booking.js`, `crm.js`, `posts.js`, `quick.js`, `ctv.js`, `media.js`.
- `schema*.sql`, `seed.sql`: cấu trúc và nội dung ban đầu. `migrations/`: chỉ cho database đã tạo từ bản cũ.
- `tests/`: test máy chủ (`*.test.mjs`) và kiểm tra tĩnh giao diện (`static-site.test.mjs`).
- `workers/clock/`: worker đồng hồ gửi bài đến giờ (xem bên dưới).

**Lưu ý khi triển khai:** kiểm tra một bản preview trên Cloudflare Pages trước khi đưa lên production, để xác nhận thư mục `_worker.js/` được bundle đúng.

## Giới hạn truy cập

- Đăng nhập quản trị: tối đa 10 lần thử sai mỗi IP trong 15 phút; tối đa 300 lần mỗi 15 phút trên toàn hệ thống (ngưỡng này chỉ để chặn tấn công diện rộng, không khóa Chủ).
- Form khách trên website: tối đa 10 lần mỗi IP mỗi giờ; tối đa 1000 lần mỗi giờ trên toàn hệ thống.
- Giới hạn toàn cục có thể bị tấn công lấp đầy. Bước tiếp theo nên là Cloudflare Turnstile, cần tài khoản Cloudflare để cấu hình.

## Worker đồng hồ (`workers/clock`)

Worker này gọi `/api/machine/tick` mỗi phút để gửi bài đến giờ sang Make. Triển khai riêng:

1. Tạo khóa ngẫu nhiên dài (ví dụ 40 ký tự base64url), đặt làm Secret `TICK_KEY` trên worker. Trong D1 `serene-content`, thêm dòng vào `machine_tokens` với `scope` = `clock` và `hash` = SHA-256 hex của khóa (khóa thô không lưu trong database).
2. Đặt Variable `TICK_URL` = `https://<website>/api/machine/tick`.
3. Trong thư mục `workers/clock`, chạy `npx wrangler deploy`. Cron được khai báo trong `wrangler.toml` (mỗi phút).

Nếu không cần đăng bài tự động từ Make, có thể không triển khai worker này.
