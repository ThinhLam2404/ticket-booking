# Continue Note

Ngày cập nhật: 2026-09-11

## Cấu trúc project

Repository root:

```text
D:\Workspace\CODE\nestjs\ticket-booking
```

Backend:

```text
D:\Workspace\CODE\nestjs\ticket-booking\be
```

Frontend:

```text
D:\Workspace\CODE\nestjs\ticket-booking\fe
```

Root giữ `.git` và `.gitignore`; source backend/frontend nằm lần lượt trong `be/` và `fe/`.

## Trạng thái verification

### Root command runner

Root `package.json` đã được thêm để điều phối backend/frontend mà không cần đổi thư mục:

```bash
npm run install:all
npm run dev
npm run build
npm run lint
npm run typecheck
npm run check
```

`npm run dev` dùng `concurrently` để chạy `be` watch và `fe` Vite song song. `be/package-lock.json` và `fe/package-lock.json` vẫn độc lập; root có `package-lock.json` riêng cho command runner.

### Shared system/API documentation

Canonical documentation nằm tại:

```text
docs/SYSTEM_AND_API.md
```

Tài liệu root bao phủ repository layout, frontend runtime/API client, backend API contract, database, infrastructure, testing và root commands.

### Root static checks

Đã chạy từ repository root:

```bash
npm run lint
npm run typecheck
npm run build
npm run test:all
npm run check:ci
```

Kết quả: lint, typecheck, backend/frontend build, 6 unit tests, 4 E2E tests và 9 integration tests đều pass.

OpenAPI artifacts:

- `openapi/ticket-booking.openapi.json` được export từ backend Swagger document factory.
- `fe/src/generated/openapi.d.ts` được sinh bằng `openapi-typescript`.
- `npm run api:check` kiểm tra artifacts deterministic bằng temporary output.
- Spec đã được chuẩn hóa cho pagination, seat map, payment wrapper, nested tickets, enum/date-time và error response.

Integration:

- `npm run test:integration` chạy với PostgreSQL/Redis thật trên test ports `55432`/`56379` và tự teardown.
- Suite bao phủ readiness, concurrent hold, hold idempotency, different payload conflict, expiry, payment retry và payment failure.
- Concurrent payment retry đã yêu cầu sửa production fallback để trả canonical result, không tạo duplicate payment/ticket.
- Integration runner có safety guard và không thể reset development database/Redis.

### Root runtime smoke

Đã chạy `npm run dev` từ repository root với retry startup:

- Backend `GET /api/v1/health` trả `200`.
- Frontend Vite tại port `5173` trả `200` và có root element.
- Process root dev đã được dừng sau smoke test.

### Backend static checks

Chạy từ `be/`:

```bash
npm ci
npm run prisma:generate
npx prisma validate
npm run lint
npm run typecheck
npm run build
npm test
npm run test:e2e
```

Kết quả:

- Prisma generate/validate pass.
- Lint pass.
- Typecheck pass.
- Build pass.
- 4 test files, 6 unit tests pass.
- 1 E2E file, 4 E2E tests pass.

### Frontend static checks

Chạy từ `fe/`:

```bash
npm ci
npm run lint
npm run build
```

Kết quả:

- Lint pass.
- TypeScript/Vite build pass.

### Infrastructure

Docker Compose từ `be/` đã chạy thành công:

```bash
docker compose up -d --wait
docker compose ps
```

Services healthy:

- PostgreSQL 17 tại `localhost:5432`.
- Redis 7 tại `localhost:6379`.

Migration và seed đã chạy thành công:

```bash
npm run prisma:deploy
npm run prisma:seed
```

Seed đã tạo admin, movie `Interstellar`, cinema, room, 32 seats và showtime tương lai.

### Backend runtime

Backend production build đã được start từ `be/` tại `localhost:3000`.

Đã kiểm tra thành công:

- `GET /api/v1/health` trả `200`.
- `GET /api/v1/health/ready` trả database/redis `up`.
- `GET /api/v1/movies` trả movie seed và pagination meta.

### API smoke flow

Đã kiểm tra với PostgreSQL/Redis thật:

```text
register
→ lấy showtime
→ lấy seat map
→ hold seat
→ retry cùng idempotency key
→ checkout
→ mock payment success
→ ticket
```

Kết quả:

- Register thành công.
- Retry hold trả cùng booking ID.
- Checkout tạo payment `PENDING`.
- Payment chuyển `SUCCEEDED`.
- Booking chuyển `CONFIRMED`.
- Ticket được phát hành.

Đã kiểm tra thêm:

- Hai user hold cùng seat nhận `201` và `409`.
- Payment failure chuyển payment `FAILED` và booking `CANCELLED`.
- Seat sau payment failure có thể được user khác hold lại.

### Frontend runtime

Frontend Vite đã được start thành công từ `fe/` tại port `4173` và trả HTTP `200`.

Frontend gọi backend mặc định:

```text
http://localhost:3000/api/v1
```

Flow UI đã sửa đúng thứ tự:

```text
hold
→ checkout
→ mock payment
```

## Các process/service đã dùng khi kiểm tra

- PostgreSQL và Redis Docker containers đang chạy.
- Backend NestJS production process đã được start để smoke test.
- Frontend Vite process đã được start để kiểm tra HTTP.
- Smoke runtime đã pass với PostgreSQL/Redis thật:
  - `GET /api/v1/health` và `/health/ready` trả `200`.
  - Seed catalog trả movie/showtime/seat map.
  - Customer flow register → hold → retry hold → checkout → payment success → ticket pass.
  - Hai user tranh chấp cùng seat nhận `201` và `409`.
  - Payment failure giải phóng seat để user khác hold lại.
  - Frontend Vite từ `fe/` trả HTTP `200` tại port test.

Nếu cần dừng các process app thủ công, dừng process Nest/Vite tương ứng; không cần dừng các process hệ thống khác.

## Vấn đề còn tồn tại

- Docker Compose chỉ có PostgreSQL và Redis, không có API/frontend container.
- Integration suite hiện chưa bao phủ showtime overlap, migration backfill và refresh token rotation concurrent.
- Frontend chưa có component/integration test.
- Tài liệu system/API canonical đã chuyển ra `docs/SYSTEM_AND_API.md` để dùng chung cho `be/` và `fe/`.
- Root `package.json` đã có command runner và API generation pipeline để chạy cả backend/frontend mà không cần đổi thư mục.
- `package.json#prisma` seed config có warning deprecated khi nâng Prisma 7; hiện project dùng Prisma 6.19.3.
- `npm ci` backend báo vulnerabilities từ dependency tree; cần xử lý riêng bằng `npm audit`.
- Mock payment chỉ dành cho development/test.

## Lệnh tiếp tục

Từ repository root:

```bash
npm run infra:up
npm run dev
```

Các lệnh riêng:

```bash
npm run dev:be
npm run dev:fe
npm run prisma:studio
npm run api:generate
npm run api:check
npm run test:integration
npm run check
npm run check:ci
```

Swagger:

```text
http://localhost:3000/api/docs
```

## Ưu tiên tiếp theo

1. Bổ sung integration test cho showtime overlap, migration backfill và refresh token rotation concurrent.
2. Bổ sung admin UI.
3. Tách payment provider thật và webhook verification.
4. Bổ sung ticket check-in/refund.
5. Thêm frontend component/integration tests.
6. Thêm Dockerfile/CI cho `be` và `fe`.
7. Xử lý `npm audit` và Prisma config warning.
