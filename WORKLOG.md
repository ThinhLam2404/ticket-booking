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

## Roadmap các sprint

### Sprint 0 — Nền tảng correctness/error/test — ĐÃ HOÀN TẤT

- Chuẩn hóa domain error codes và `VALIDATION_FAILED`.
- Frontend dịch lỗi theo `code`, fallback tiếng Việt, không hiển thị raw network error.
- Sửa idempotent hold retry sau khi showtime/movie thay đổi trạng thái.
- Bổ sung OpenAPI `409` cho PATCH seat.
- Fix province picker: tìm không dấu/codename, reset search, lỗi API thật, layout ít kết quả và mobile viewport.
- Deploy migration chain trên PostgreSQL integration và bổ sung regression tests.

### Sprint 1 — Hold, expiry và payment correctness — ƯU TIÊN CAO NHẤT

- Back/“Thay đổi ghế” phải xác nhận, cancel/release hold thành công rồi mới điều hướng.
- Làm cancel idempotent: `PENDING -> CANCELLED`; retry trên `CANCELLED/EXPIRED` trả kết quả hiện tại; `CONFIRMED` trả conflict.
- Chính sách server: `HOLD_TTL = 10 phút`, buffer trước giờ chiếu `5 phút`; vùng direct-payment là `<= 15 phút` trước giờ chiếu.
- Booking còn hơn 15 phút: hold tối đa 10 phút.
- Booking còn tối đa 15 phút: không tạo hold dài hạn, dùng direct-payment flow.
- Direct payment mock phải claim ghế và hoàn tất payment/ticket trong một transaction; thất bại không để ghế bị hold.
- Expiry-aware seat state, tự giải phóng DB/Redis và điều hướng khi countdown hết hạn.
- Countdown/progress thực theo `createdAt` và `expiresAt`; xóa timer giả `09:59` trước khi hold được tạo.
- Hardening payment race/idempotency: không cho `CONFIRMED + FAILED`, lock order thống nhất, hash payload idempotency.
- Thêm integration tests cho cancel, direct payment, expiry boundary và payment races.

### Sprint 2 — Admin showtime và bulk scheduling

- Chỉ cho admin chọn movie `PUBLISHED` khi tạo suất chiếu.
- Sửa timezone `datetime-local` theo giờ Việt Nam `Asia/Ho_Chi_Minh` và test round-trip.
- Backend tự tính `endsAt = startsAt + movie.duration`; UI hiển thị kết thúc read-only.
- Khi đổi start/movie thì tính lại end; chỉ đổi pricing thì giữ end hiện tại.
- Thêm bulk preview và bulk commit cho nhiều suất cùng movie/room.
- Sinh slot tuần tự theo `firstStartsAt`, `duration`, `turnaroundMinutes`; không dùng random trong production.
- Commit bulk atomic, conflict một slot thì rollback toàn batch.
- Map exclusion constraint overlap thành lỗi `409 SHOWTIME_OVERLAP`.
- Thêm integration tests concurrency, adjacency và rollback.

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
- Browser verification desktop và viewport `<= 720px` cho hold/back, direct payment, countdown, bulk showtime, province search, TMDB import và trailer unavailable.
- Chạy đầy đủ lint, typecheck, build, unit, e2e, integration, API generation/check.
- Seed hai lần trên database development, kiểm tra counts và idempotency.
- Cập nhật README, OpenAPI, generated frontend types và design reference nếu UI admin thay đổi lớn.

## Việc còn lại

- Chạy seed hai lần trên database development và kiểm tra counts/idempotency nếu cần môi trường dữ liệu thật.
- Bắt đầu Sprint 1: release hold khi Back/Thay đổi ghế, direct payment trong vùng T-15, expiry-aware seat state, countdown/progress và payment race hardening.
