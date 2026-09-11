# Movie Ticket Booking Backend

Tài liệu hệ thống/API dùng chung nằm tại [`../docs/SYSTEM_AND_API.md`](../docs/SYSTEM_AND_API.md).

## Mục tiêu

Backend phục vụ hệ thống đặt vé rạp chiếu phim. MVP hỗ trợ quản lý phim, rạp, phòng, ghế, suất chiếu, giữ ghế, đặt vé, thanh toán giả lập và phát hành vé.

## Công nghệ

- NestJS 12, Express và TypeScript
- PostgreSQL và Prisma ORM
- Redis cho khóa giữ ghế có thời hạn
- Swagger/OpenAPI
- Vitest và Supertest
- Docker Compose cho PostgreSQL và Redis

Frontend MVP nằm trong project sibling `../fe/`, sử dụng React, Vite và TypeScript. Root `../package.json` cung cấp command runner để chạy cả backend và frontend.

## Cấu trúc

```text
be/src/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── movies/
│   ├── cinemas/
│   ├── rooms/
│   ├── seats/
│   ├── showtimes/
│   ├── bookings/
│   ├── payments/
│   └── tickets/
├── database/
├── app.module.ts
└── main.ts

fe/
├── src/api.ts
├── src/types.ts
├── src/App.tsx
└── package.json
```

Mỗi domain nằm trong `be/src/modules/<domain>` và tự quản lý controller, service, DTO, guard và test của mình. Thành phần dùng chung nằm trong `be/src/common`.

## Domain chính

- `User`: khách hàng và quản trị viên.
- `Movie`: thông tin phim và thời lượng.
- `Cinema`, `Room`, `Seat`: cấu trúc cụm rạp và sơ đồ ghế.
- `Showtime`, `ShowtimeSeat`: suất chiếu, giá và trạng thái ghế.
- `Booking`, `BookingItem`: đơn đặt và các ghế được chọn.
- `Payment`: thanh toán giả lập trong MVP.
- `Ticket`: vé được phát hành sau khi thanh toán thành công.

## Luồng đặt vé

1. Khách hàng chọn phim, rạp và suất chiếu.
2. Hệ thống trả về sơ đồ ghế của suất chiếu.
3. Redis khóa các ghế được chọn trong 5–10 phút.
4. Hệ thống tạo booking `PENDING` và tính giá ở server.
5. Thanh toán thành công chuyển booking thành `CONFIRMED` và tạo ticket.
6. Booking hết hạn hoặc thanh toán thất bại được hủy và giải phóng ghế.

PostgreSQL transaction, unique constraint và Redis lock phải được phối hợp để ngăn hai khách hàng mua cùng một ghế. Checkout và webhook thanh toán phải hỗ trợ idempotency.

## Chạy local

Từ repository root:

```bash
cp be/.env.example be/.env
cp fe/.env.example fe/.env
npm install
npm run install:all
npm run infra:up
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm run dev
```

`npm run dev` chạy backend watch và frontend Vite song song. Frontend mặc định gọi `http://localhost:3000/api/v1`; có thể đổi bằng `fe/.env` với `VITE_API_URL`.

Thiết lập `SEED_ADMIN_EMAIL` và `SEED_ADMIN_PASSWORD` trong `.env` trước khi chạy seed. Mock payment chỉ hoạt động ở `development` và `test`.

Swagger dự kiến được cung cấp tại `http://localhost:3000/api/docs` và API sử dụng prefix `/api/v1`.

## Lộ trình MVP

1. Nền tảng dự án, database, cấu hình và health check.
2. Authentication, refresh token và phân quyền.
3. CRUD phim, rạp, phòng, ghế và suất chiếu.
4. Xem sơ đồ ghế, giữ ghế và xử lý booking hết hạn.
5. Thanh toán giả lập và phát hành ticket.
6. Unit, integration, E2E và concurrency test.

## Tiêu chí hoàn thành

- Không thể xác nhận hai booking cho cùng một ghế và suất chiếu.
- Ghế được giải phóng tự động khi thời gian giữ hết hạn.
- Giá booking luôn được tính tại server.
- Retry payment/webhook không tạo giao dịch hoặc ticket trùng.
- API có validation, tài liệu Swagger và kiểm thử luồng chính.

## Kiểm tra hiện tại

Từ repository root:

```bash
npm run prisma:generate
npm run lint
npm run typecheck
npm run build
npm test
npm run test:e2e
npm run check
```

Scheduler expire booking chạy mỗi phút. Test unit hiện bao phủ password, JWT và scheduler; E2E bao phủ prefix API, health liveness và validation auth. Integration/concurrency test với PostgreSQL và Redis thật cần chạy khi Docker Desktop hoạt động.
