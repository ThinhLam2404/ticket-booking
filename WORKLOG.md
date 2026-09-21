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

### Sprint 1 — Hold, expiry và payment correctness — ĐANG THỰC HIỆN

- ĐÃ LÀM: Back/“Thay đổi ghế” xác nhận, cancel/release hold thành công rồi mới điều hướng.
- ĐÃ LÀM: Cancel idempotent: `PENDING -> CANCELLED`; retry trên `CANCELLED/EXPIRED` trả kết quả hiện tại; `CONFIRMED` trả conflict.
- ĐÃ LÀM: Chính sách server `HOLD_TTL = 10 phút` + buffer `5 phút`; vùng purchase không hold là `<= 15 phút` trước giờ chiếu.
- ĐÃ LÀM: Booking còn hơn 15 phút dùng hold; booking trong vùng cuối dùng atomic purchase, không tạo `HELD`.
- ĐÃ LÀM: Atomic purchase claim ghế và hoàn tất payment/ticket trong một transaction; Couple được canonicalize.
- ĐÃ LÀM: Seat read và purchase transaction tự normalize DB hold đã hết hạn.
- ĐÃ LÀM: Countdown/progress checkout dùng thời gian còn lại; xóa timer giả `09:59` trên seat map.
- ĐÃ LÀM: Integration coverage cho cancel idempotency và purchase boundary.
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
- Browser verification desktop và viewport `<= 720px` cho hold/back, atomic purchase, countdown, bulk showtime, province search, TMDB import và trailer unavailable.
- Chạy đầy đủ lint, typecheck, build, unit, e2e, integration, API generation/check.
- Seed hai lần trên database development, kiểm tra counts và idempotency.
- Cập nhật README, OpenAPI, generated frontend types và design reference nếu UI admin thay đổi lớn.

## Việc còn lại

- Hoàn tất payment payload hash/race hardening và test cạnh tranh chuyên sâu.
- Browser verification desktop và viewport `<= 720px` cho hold/back, atomic purchase, countdown và admin bulk scheduling.
- Test concurrency hai bulk scheduling request đồng thời.
- Chạy seed hai lần trên database development và kiểm tra counts/idempotency nếu cần môi trường dữ liệu thật.
