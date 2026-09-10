# Continue Note

Ngày cập nhật: 2026-09-07

## Đã hoàn thành trong phiên này

- Đọc và rà soát note cũ cùng toàn bộ runtime code.
- Tạo migration `prisma/migrations/20260907100000_booking_flow/migration.sql` cho:
  - trạng thái ghế `AVAILABLE/HELD/SOLD`
  - `heldUntil`, `heldByBookingId`
  - `holdToken`, `idempotencyKey`, `requestHash`
  - refresh token
  - payment idempotency key
  - composite unique `BookingItem`
  - backfill booking/seat/payment cũ
  - check constraints và exclusion constraint showtime overlap
- Tạo seed idempotent tại `prisma/seed.ts`:
  - admin từ `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`
  - movie, cinema, room, seats, showtime mẫu
- Thêm scripts `prisma:deploy` và `prisma:seed`.
- Sửa `RoomsModule` để đăng ký controller/service.
- Thêm validation enum cho seat type và query bắt buộc `cinemaId`.
- Tách `configureApp()` dùng chung giữa production bootstrap và E2E.
- Thêm environment validation, JWT fail-fast, HS256, issuer/audience, không fallback secret.
- JWT guard kiểm tra user/role hiện tại từ database.
- Redis connect ở module init và release lock theo owner.
- Booking:
  - request fingerprint cho idempotency key
  - retry cùng key trả booking cũ
  - key khác payload trả conflict
  - expiry scheduler mỗi phút
  - checkout transaction-safe
  - payment pending chuyển failed khi cancel/expire
- Payment mock:
  - chỉ hoạt động ở `development`/`test`
  - bắt buộc idempotency key
  - success/failure cùng transaction state transition
  - ticket upsert chống retry trùng
  - map reference/idempotency collision thành conflict
- Bỏ request-driven cleanup ghế độc lập khỏi `ShowtimesService`.
- Thêm unit test password, JWT, scheduler và E2E test prefix/health/auth validation.
- Cập nhật `PROJECT.md`.

## Kiểm tra đã pass

```bash
npm run prisma:generate
npx prisma validate
npm run format
npm run lint
npm run typecheck
npm run build
npm test
npm run test:e2e
```

Kết quả cuối: Prisma validate pass, typecheck/build pass, 6 unit tests pass, 3 E2E tests pass. Lint pass sau khi dọn import thừa; Prisma có warning package.json config sẽ deprecated ở Prisma 7.

## Blocker chưa hoàn tất

Docker Desktop/daemon chưa chạy trong môi trường hiện tại:

```text
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
```

Vì vậy migration và seed chưa được apply/exercise trên PostgreSQL/Redis thật. Chưa chạy được concurrency/integration test thực tế.

## Việc cần làm lần sau

1. Bật Docker Desktop.
2. Chạy:

```bash
docker compose up -d --wait
npm run prisma:deploy
npm run prisma:seed
```

3. Kiểm tra migration trên database có dữ liệu cũ, đặc biệt:
   - booking `CONFIRMED` -> seat `SOLD`
   - booking `PENDING` chưa hết hạn -> seat `HELD`
   - booking hết hạn/cancel -> seat `AVAILABLE`
4. Chạy manual flow:
   - login admin
   - tạo/cập nhật catalog
   - login customer
   - xem showtime/seats
   - hold -> checkout -> mock payment -> ticket
5. Viết integration/concurrency test dùng PostgreSQL/Redis thật:
   - hai user hold cùng seat
   - retry cùng booking idempotency key
   - payment success retry không tạo ticket trùng
   - payment failure giải phóng seat
   - expiry scheduler giải phóng seat
   - hai showtime overlap cùng room
6. Kiểm tra `npm audit` và quyết định xử lý 8 vulnerabilities hiện tại.
7. Cân nhắc chuyển cấu hình Prisma từ `package.json#prisma` sang `prisma.config.ts` trước Prisma 7.
8. Bổ sung rate limiting, Helmet, structured logging và cleanup refresh token hết hạn.
