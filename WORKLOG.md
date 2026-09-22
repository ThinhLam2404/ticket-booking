# Worklog — 2026-09-17

## Trạng thái

Đã hoàn thiện batch xử lý các finding về cinema seed tĩnh, layout ghế Couple, pricing showtime và UI admin/booking. Chưa commit.

## Đã làm

- Seed cinema tĩnh từ `be/prisma/data/cinemas.seed.json`, không gọi mạng lúc runtime hoặc seed.
- Seed upsert cinema/room, sinh layout ghế bằng `buildSeatLayout()` và bảo vệ dữ liệu showtime/booking hiện có.
- Cleanup seed cũ theo namespace static IDs; chỉ xóa cinema/room không còn showtime liên quan.
- Showtime update chỉ repricing khi giá hoặc room thay đổi; chỉ đổi lịch/phim giữ nguyên `ShowtimeSeat.price`.
- DTO pricing giữ multiplier optional trong OpenAPI và generated frontend types.
- Layout hợp lệ yêu cầu hàng liên tục từ A, tối thiểu 5 hàng, ba hàng đầu Standard, hàng giữa VIP và hàng cuối Couple chẵn.
- Seat CRUD chặn Couple đơn lẻ và chặn sửa layout hoàn chỉnh ngoài bulk layout.
- Booking canonicalize Couple thành hai ghế vật lý và giới hạn tối đa 10 ghế vật lý.
- Booking UI chọn cả cặp Couple, hiển thị legend/nhãn trạng thái và loại bỏ cặp không còn khả dụng sau refresh.
- Admin UI quản lý Couple qua bulk layout, không còn mở form CRUD đơn lẻ cho Couple.
- Cập nhật README và generated OpenAPI artifacts.

## Verification đã pass

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`: 32/32
- `npm run test:e2e`: 6/6
- `npm run test:integration`: 9/9
- `npm run api:check`
- `git diff --check`
- Prisma schema validation và migration deploy trên PostgreSQL integration
- Focused layout, seats, showtimes, bookings và error-filter regression tests: 20/20

## Sprint 0 đã hoàn tất

- Error response giữ domain `code` ổn định, có `VALIDATION_FAILED`, và frontend dịch theo code với fallback tiếng Việt.
- Idempotent hold retry được kiểm tra trước trạng thái movie/showtime hiện tại.
- PATCH seat công bố đầy đủ lỗi `409` trong OpenAPI.
- Province picker hỗ trợ tìm không dấu/codename, reset search khi đóng, dùng lỗi API thật và không kéo giãn option khi ít kết quả.
- Mobile province picker có fallback `100vh` và hỗ trợ `100dvh`.
- Migration index dùng `DROP INDEX IF EXISTS`; migration chain đã deploy sạch trên integration database.

## Sprint 3 — Tích hợp SePay QR & Webhook — ĐÃ HOÀN TẤT

- Chuẩn hóa hold policy: > 15 phút hold 10 phút; > 5 đến 15 phút hold 2 phút; <= 5 phút chặn tạo booking mới để giữ buffer.
- Migration database: bảng `SepayPaymentIntent` (paymentCode unique, expectedAmount, expiresAt) và `SepayTransaction` (sepayId unique, transferAmount, status MATCHED / REVIEW_REQUIRED / CONFIRMED / REFUNDED).
- `SepayService`:
  - `checkout()`: tạo hoặc reuse intent với VietQR compact QR URL và mã thanh toán `CB...`.
  - `handleWebhook()`: xác thực API key, bỏ qua giao dịch ra hoặc trùng id, khớp mã và số tiền, xác nhận booking và phát hành vé; nếu lỗi/hết hạn chuyển `REVIEW_REQUIRED` để hoàn tiền thủ công.
  - `findTransactions()` và `updateTransactionStatus()` cho Admin.
- `SepayWebhookGuard`: xác thực `Authorization: Apikey <KEY>`.
- Frontend `BookingPages.tsx`: hiển thị QR SePay, thông tin ngân hàng, nút copy nội dung CK, countdown hết hạn và polling kiểm tra trạng thái tự động chuyển sang trang vé khi thành công.
- Admin UI `AdminPaymentsPage`: xem danh sách giao dịch SePay, lọc theo trạng thái và đánh dấu đã hoàn tiền thủ công.
- Unit tests: 6 test cases cho `SepayService` (checkout tạo intent, reuse intent, webhook bỏ qua transferType khác, bỏ qua trùng id, xử lý thiếu mã và sai số tiền sang REVIEW_REQUIRED).
- Cập nhật README, generated OpenAPI và types.

## Roadmap các sprint

### Sprint 0 — Nền tảng correctness/error/test — ĐÃ HOÀN TẤT

- Chuẩn hóa domain error codes và `VALIDATION_FAILED`.
- Frontend dịch lỗi theo `code`, fallback tiếng Việt, không hiển thị raw network error.
- Sửa idempotent hold retry sau khi showtime/movie thay đổi trạng thái.
- Bổ sung OpenAPI `409` cho PATCH seat.
- Fix province picker: tìm không dấu/codename, reset search, lỗi API thật, layout ít kết quả và mobile viewport.
- Deploy migration chain trên PostgreSQL integration và bổ sung regression tests.

### Sprint 1 — Hold, expiry và payment correctness — ĐANG THỰC HIỆN

- ĐÃ LÀM: Back/“Thay đổi ghế” xác nhận, cancel/release hold thành công rồi mới điều hướng.
- ĐÃ LÀM: Cancel idempotent: `PENDING -> CANCELLED`; retry trên `CANCELLED/EXPIRED` trả kết quả hiện tại; `CONFIRMED` trả conflict.
- ĐÃ LÀM: Chính sách server giữ ghế 10 phút khi suất còn hơn 15 phút, 2 phút khi còn từ 5 đến 15 phút, và chặn hold mới khi còn tối đa 5 phút.
- ĐÃ LÀM: Couple được canonicalize khi hold; seat read và payment transaction tự normalize DB hold đã hết hạn.
- ĐÃ LÀM: Countdown/progress checkout dùng thời gian còn lại; xóa timer giả `09:59` trên seat map.
- ĐÃ LÀM: Integration coverage cho cancel idempotency và boundary suất chiếu quá gần.
- CÒN LẠI: Hardening payment race/idempotency bằng payload hash bền vững, lock order thống nhất và kiểm thử race chuyên sâu.
- CÒN LẠI: Điều hướng tự động rõ ràng hơn khi countdown hết hạn và browser verification desktop/mobile.

### Sprint 2 — Admin showtime và bulk scheduling — ĐANG THỰC HIỆN

- ĐÃ LÀM: Chỉ cho admin chọn movie `PUBLISHED` khi tạo/sửa suất chiếu.
- ĐÃ LÀM: `datetime-local` được serialize theo giờ Việt Nam `Asia/Ho_Chi_Minh` với offset `+07:00`.
- ĐÃ LÀM: Backend tự tính `endsAt = startsAt + movie.duration`; UI hiển thị kết thúc read-only.
- ĐÃ LÀM: Khi đổi start/movie thì tính lại end; chỉ đổi pricing giữ end hiện tại.
- ĐÃ LÀM: Thêm bulk preview và bulk commit cho nhiều suất cùng movie/room.
- ĐÃ LÀM: Sinh slot tuần tự theo `firstStartsAt`, `duration`, `turnaroundMinutes`; không dùng random.
- ĐÃ LÀM: Commit bulk atomic với Serializable transaction; overlap rollback toàn batch.
- ĐÃ LÀM: Exclusion/transaction overlap trả `409 SHOWTIME_OVERLAP`.
- ĐÃ LÀM: Unit coverage timezone/duration/preview và integration coverage bulk/rollback (chưa execute được do Docker daemon tắt).
- CÒN LẠI: Chạy lại integration suite khi Docker Desktop hoạt động, browser verification admin bulk flow và test concurrency hai bulk request đồng thời.

### Sprint 3 — TMDB import nhiều phim và trailer

- Sau import patch/invalidate toàn bộ cache `tmdb-movies`; row đổi ngay thành `Đã nhập`.
- Pending state theo từng `tmdbId`, không khóa/đổi text toàn bộ danh sách.
- Giữ modal mở sau import để nhập tiếp nhiều phim.
- Thêm pagination, checkbox, chọn nhiều phim và bounded queue concurrency 2–3.
- Bulk import tối đa khoảng 20 phim, partial success, retry riêng item thất bại.
- Đồng bộ trailer TMDB theo thứ tự `vi-VN -> en-US`, ưu tiên official trailer rồi trailer/teaser.
- Cho phép resync movie đã import để cập nhật trailer mới.
- Trailer modal có loading, lỗi phát, và link mở trực tiếp trên YouTube.
- Thêm tests cache synchronization, bulk partial failure và trailer fallback.

### Sprint 4 — UX polish, browser verification và vận hành

- Hoàn thiện toàn bộ thông báo lỗi admin bằng tiếng Việt.
- Bổ sung request ID ở vùng hỗ trợ, không hiển thị làm lỗi chính.
- Browser verification desktop và viewport `<= 720px` cho hold/back, checkout, countdown, bulk showtime, province search, TMDB import và trailer unavailable.
- Chạy đầy đủ lint, typecheck, build, unit, e2e, integration, API generation/check.
- Seed hai lần trên database development, kiểm tra counts và idempotency.
- Cập nhật README, OpenAPI, generated frontend types và design reference nếu UI admin thay đổi lớn.

## Việc còn lại

## 2026-09-21 — Loại bỏ legacy PaymentsService/mock payment

- Xóa `PaymentsModule`, `PaymentsController`, `PaymentsService` và mock DTO; production chỉ còn checkout/webhook SePay.
- Giữ bảng `Payment` vì SePay vẫn tạo `provider: SEPAY`, nhưng xóa `Payment.idempotencyKey` và unique index bằng migration `20260921110000_remove_mock_payment_idempotency`.
- Cancel/expire booking cập nhật `SepayPaymentIntent` sang `CANCELLED`/`EXPIRED`.
- Webhook SePay xử lý race duplicate theo unique `sepayId`; integration coverage chuyển từ mock payment sang matched, duplicate/concurrent và review-required webhook.
- Đã pass lint, typecheck, build, unit `52/52`, E2E `6/6`, integration `12/12`, `api:check`.

## 2026-09-21 — Webhook SePay vẫn 400 do test delivery dùng `id: 0`

- Log `SePay webhook payload rejected` cho thấy bản "Gửi thử" của SePay dùng `"id": 0` giả, rớt `@Min(1)` trong DTO.
- Bỏ `@Min(1)`, giữ `@IsInt()` (giao dịch thật luôn id ≥ 1; bản test sai số tài khoản nên cũng không lưu DB).
- Thêm unit test payload test (`id: 0`) → 201; verify HTTP thật với đúng payload SePay → 201.
- Tổng unit hiện tại: 52/52 pass.

## 2026-09-21 — Sửa webhook SePay 400 do field `code`

- Nguyên nhân: global `ValidationPipe` bật `forbidNonWhitelisted`, payload thật của SePay có field `code` chưa khai báo trong DTO nên mọi webhook (kể cả Gửi thử) đều 400.
- Webhook giờ bypass pipe toàn cục (body dạng record) và tự validate lenient trong `SepayService`: strip field lạ, chỉ 400 khi thiếu/sai field bắt buộc; thêm `code` optional, `content` optional, `@IsNumber()` cho `transferAmount`.
- Thêm 2 unit test (payload đủ field SePay + field lạ vẫn 201; thiếu field bắt buộc thì 400); đã verify qua HTTP thật: payload mẫu SePay → 201, gửi trùng → 201 idempotent, sai key → 401.
- Đồng bộ README.

- Hoàn tất payment payload hash/race hardening và test cạnh tranh chuyên sâu.
- Browser verification desktop và viewport `<= 720px` cho hold/back, checkout, countdown và admin bulk scheduling.
- Test concurrency hai bulk scheduling request đồng thời.
- Chạy seed hai lần trên database development và kiểm tra counts/idempotency nếu cần môi trường dữ liệu thật.

## 2026-09-21 — Đồng bộ integration spec với payment flow hiện tại

- Chuẩn hóa coverage checkout theo route `/api/v1/payments/bookings/:id/checkout`.
- Thay toàn bộ coverage mock bằng checkout/webhook SePay, nên không còn endpoint mock trong integration flow.
- Thay assertion mã lỗi cũ `PURCHASE_REQUIRED` bằng `SHOWTIME_TOO_CLOSE` cho suất còn dưới 5 phút.
- Lint, typecheck, build, unit `52/52`, E2E `6/6`, integration `12/12` và `api:check` pass sau đợt dọn mock.

## 2026-09-21 — Sửa bulk conflict tiếng Việt, guard rời trang thanh toán, CSS nút payment, giờ vận hành 08:00–23:00 và gợi ý khung trống

- Bulk preview trả `reasonCode` (`SHOWTIME_OVERLAP`/`SHOWTIME_OUTSIDE_HOURS`) và `conflicts[]` kèm giờ suất đang chiếm thay cho chuỗi tiếng Anh cứng; frontend render `Trùng với suất 14:00 – 16:10, 18:20 – 20:30` (ngăn cách dấu phẩy, khác ngày thì prefix ngày).
- Thêm CSS `.bulk-preview*` (trước đó chưa có nên các suất dính sát nhau).
- Trang thanh toán: guard khi booking còn `PENDING` — nút Back trình duyệt, click link rời trang và đóng tab (`pagehide` + `fetch keepalive`) đều hỏi xác nhận rồi tự gọi cancel nhả ghế; redirect vé khi `CONFIRMED` không bị chặn. Cancel API vốn idempotent nên gọi thừa an toàn.
- Sửa toàn bộ nút dùng class không tồn tại (`btn-primary`/`btn-secondary`/`btn-full`/`btn-sm`) sang `.primary`/`.secondary` đúng design system; thêm utility `.btn-full`, `.btn-sm` và `.summary-actions`.
- Quy tắc giờ vận hành: suất chiếu chỉ được bắt đầu 08:00–23:00 hằng ngày (giờ VN), suất 23:00 được chấp nhận; áp dụng cho create/update/previewBulk/createBulk với code mới `SHOWTIME_OUTSIDE_HOURS`.
- Endpoint admin mới `GET /showtimes/rooms/:roomId/free-slots` gợi ý khung trống trong `[08:00 → 23:00]` sau khi trừ suất bận và turnaround hai đầu; UI bulk modal và form lẻ có nút xem khung trống, chip khung trống và hint cảnh báo ngoài giờ.
- Cố định giờ VN trong unit/integration spec bulk (`10:00 VN`) để không flaky theo giờ chạy; thêm 7 unit test mới (giờ vận hành, conflicts, free slots).
- Đồng bộ README, OpenAPI và generated frontend types.
