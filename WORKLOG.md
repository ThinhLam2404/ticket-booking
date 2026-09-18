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
- `npm test`: 28/28
- `npm run test:e2e`: 6/6
- `npm run api:check`
- `git diff --check`
- Prisma schema validation
- Focused layout, seats, showtimes và bookings regression tests: 17/17

## Chưa xác minh được

- `npm run test:integration` và seed thực tế chưa chạy vì Docker Desktop không khả dụng trong môi trường hiện tại.
- `prisma migrate status` không kết nối được PostgreSQL.
- Đã sửa `20260916080507/migration.sql` thành `DROP INDEX IF EXISTS` để database sạch không fail trước migration location phía sau. Nếu migration bản cũ đã chạy ở môi trường khác, cần xử lý checksum migration theo quy trình triển khai của môi trường đó.

## Việc còn lại

- Sau khi Docker khả dụng, chạy `npm run test:integration`, seed hai lần và kiểm tra counts/idempotency.
- Restore `be/tsconfig.build.tsbuildinfo` nếu không muốn giữ thay đổi generated cache.
