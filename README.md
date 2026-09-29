# Movie Ticket Booking System and API

Tài liệu dùng chung cho toàn bộ repository `ticket-booking`, mô tả frontend, backend, API contract, database, infrastructure, runtime flow và cách chạy hệ thống theo đúng source code hiện tại.

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Công nghệ và infrastructure](#2-công-nghệ-và-infrastructure)
3. [Kiến trúc source code](#3-kiến-trúc-source-code)
4. [Cấu hình môi trường](#4-cấu-hình-môi-trường)
5. [Database data dictionary](#5-database-data-dictionary)
6. [Migration và seed](#6-migration-và-seed)
7. [Authentication và authorization](#7-authentication-và-authorization)
8. [API reference](#8-api-reference)
9. [Các business flow](#9-các-business-flow)
10. [Concurrency và idempotency](#10-concurrency-và-idempotency)
11. [Scheduler và lifecycle](#11-scheduler-và-lifecycle)
12. [Validation và error handling](#12-validation-và-error-handling)
13. [Testing](#13-testing)
14. [Cách chạy project](#14-cách-chạy-project)
15. [Known limitations và roadmap](#15-known-limitations-và-roadmap)

## 1. Tổng quan

Đây là hệ thống đặt vé xem phim dạng monorepo gồm React/Vite frontend và NestJS modular monolith backend. Mỗi domain backend nằm trong một NestJS module riêng, tất cả cùng chạy trong một ứng dụng Express; frontend gọi API qua HTTP và quản lý phiên customer trong browser session.

MVP hiện tại hỗ trợ:

- Đăng ký, đăng nhập, refresh token và logout.
- Phân quyền `CUSTOMER` và `ADMIN`.
- CRUD phim, rạp, phòng, ghế và suất chiếu.
- Admin tạo suất chiếu đơn hoặc lập lịch hàng loạt theo thời lượng phim, timezone Việt Nam và khoảng nghỉ giữa suất.
- Admin tìm kiếm và nhập phim từ TMDB vào catalog nội bộ.
- Chọn tỉnh/thành để lọc rạp, phim và suất chiếu.
- Xem trailer YouTube chính thức trong modal an toàn.
- Xem sơ đồ ghế theo suất chiếu.
- Giữ ghế tạm thời bằng Redis.
- Tạo booking và tính tiền ở server.
- Checkout tạo payment intent SePay và mã QR chuyển khoản.
- Nhận webhook SePay, đối soát giao dịch và phát hành ticket sau thanh toán thành công.
- Hủy hoặc expire booking và giải phóng ghế.
- Swagger UI để thử API.

### Mục tiêu nhất quán dữ liệu

Một ghế theo một suất chiếu chỉ được bán một lần. Hệ thống phối hợp:

1. Redis lock có TTL để giảm tranh chấp giữa các request.
2. PostgreSQL transaction để cập nhật booking, ghế, payment và ticket.
3. Unique constraint và check constraint để bảo vệ invariant ở database.
4. Idempotency key cho hold và unique SePay transaction ID để webhook retry không tạo dữ liệu trùng.

## 2. Công nghệ và infrastructure

### 2.1. Application stack

| Thành phần     | Phiên bản/công nghệ                    | Vai trò                                           |
| -------------- | -------------------------------------- | ------------------------------------------------- |
| Framework      | NestJS 12                              | Module, dependency injection, controller, service |
| HTTP adapter   | Express (`@nestjs/platform-express`)   | Xử lý HTTP                                        |
| Language       | TypeScript                             | Type safety                                       |
| ORM            | Prisma 6.19.3                          | Schema, migration và Prisma Client                |
| Database       | PostgreSQL 17                          | Lưu dữ liệu và transaction                        |
| Cache/lock     | Redis 7 + ioredis 6                    | Lock ghế có TTL                                   |
| Authentication | JWT + `jsonwebtoken`                   | Access token/refresh token                        |
| Password       | Node `crypto.scrypt`                   | Hash password                                     |
| Validation     | `class-validator`, `class-transformer` | Validate body/query                               |
| Documentation  | `@nestjs/swagger`                      | OpenAPI/Swagger UI                                |
| Movie source   | TMDB API v3                            | Tìm kiếm và nhập metadata phim cho Admin          |
| Scheduler      | `@nestjs/schedule`                     | Expire booking mỗi phút                           |
| Frontend      | React 19, Vite 8, TypeScript             | Customer UI và API client                         |
| Frontend data  | Fetch API, sessionStorage                | HTTP request, token session và refresh            |
| Unit/E2E test  | Vitest, Supertest                      | Kiểm thử backend                                  |

Dependencies được khai báo tại `be/package.json`, `fe/package.json` và root `package.json` dùng để điều phối repository.

### 2.2. Docker services

File: `be/docker-compose.yml`; root scripts gọi file này từ repository root.

| Service    |   Port | Thông tin                                                                   |
| ---------- | -----: | --------------------------------------------------------------------------- |
| PostgreSQL | `5432` | DB `ticket_booking`, user `ticket_booking`, password local `ticket_booking` |
| Redis      | `6379` | Seat lock                                                                   |

Application hiện chạy trực tiếp bằng Node/NestJS và Vite; chỉ PostgreSQL/Redis chạy bằng Docker Compose. Email dùng SMTP provider cấu hình qua biến môi trường. Mail gửi bất đồng bộ bằng Worker Thread đọc `MailOutbox`; request chỉ chờ transaction outbox commit, không chờ SMTP. Worker được đánh thức ngay sau commit bằng message `wake` và vẫn polling fallback theo chu kỳ. Chưa có Dockerfile cho API hoặc frontend.

### 2.3. URL API

- Base URL: `http://localhost:3000`
- API prefix: `/api/v1`
- API root: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/api/docs`

Global prefix, CORS, validation pipe và Swagger được cấu hình tại `be/src/config/app.config.ts`. Frontend đọc API URL từ `fe/.env` qua biến `VITE_API_URL`.

### 2.4. Kiến trúc hệ thống

```mermaid
flowchart LR
    Client[Web or Mobile Client]
    Swagger[Swagger UI\n/api/docs]
    API[NestJS API\nExpress]
    Auth[Auth Module]
    Catalog[Catalog Modules\nMovies Cinemas Rooms Seats Showtimes]
    Booking[Booking Module]
    Payment[Payment Module]
    Ticket[Ticket Module]
    Health[Health Module]
    Scheduler[Booking Expiry Scheduler]
    Tmdb[TMDB API]
    Prisma[Prisma Client]
    PostgreSQL[(PostgreSQL)]
    Redis[(Redis)]

    Client --> API
    Swagger --> API
    API --> Auth
    API --> Catalog
    API --> Booking
    API --> Payment
    API --> Ticket
    API --> Health
    Scheduler --> Booking
    Catalog --> Tmdb
    Auth --> Prisma
    Catalog --> Prisma
    Booking --> Prisma
    Payment --> Prisma
    Ticket --> Prisma
    Health --> Prisma
    Booking --> Redis
    Health --> Redis
    Prisma --> PostgreSQL
```

## 3. Kiến trúc source code

Backend nằm trong `be/`:

```text
be/src/
├── common/
│   ├── auth/
│   ├── database/
│   └── http/
├── config/
├── database/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── movies/
│   │   ├── tmdb.client.ts
│   │   └── dto/tmdb-movie.dto.ts
│   ├── cinemas/
│   ├── rooms/
│   ├── seats/
│   ├── showtimes/
│   ├── bookings/
│   ├── payments/
│   ├── tickets/
│   ├── health/
│   └── redis/
├── app.module.ts
└── main.ts
```

Frontend nằm trong `fe/`:

```text
fe/src/
├── api.ts
├── types.ts
├── App.tsx
├── App.css
├── index.css
└── main.tsx
```

Root điều phối cả hai ứng dụng bằng `package.json`; dependency và lockfile vẫn độc lập tại `be/` và `fe/`.

### 3.1. Domain modules

| Module      | Trách nhiệm                                         |
| ----------- | --------------------------------------------------- |
| `auth`      | Register, login, refresh, logout, JWT token service |
| `users`     | Lấy thông tin user hiện tại                         |
| `movies`    | Movie catalog, lifecycle, trailer và TMDB import cho Admin |
| `cinemas`   | Cụm rạp và tỉnh/thành                                  |
| `locations` | Reference data 34 tỉnh/thành Việt Nam                 |
| `rooms`     | Phòng chiếu                                         |
| `seats`     | Ghế vật lý trong phòng                              |
| `showtimes` | Lịch chiếu và snapshot ghế theo lịch chiếu          |
| `bookings`  | Hold, checkout, cancel, expire booking              |
| `sepay`     | SePay checkout, webhook và đối soát giao dịch      |
| `tickets`   | Ticket đã phát hành                                 |
| `health`    | Liveness/readiness                                  |
| `redis`     | Redis client và lock operations                     |

### 3.2. Shared infrastructure

- `DatabaseModule` là global module và cung cấp `PrismaService`.
- `RedisModule` là global module và cung cấp `RedisService`.
- `ScheduleModule` chạy scheduler của booking.
- `ConfigModule` là global module, validate environment khi bootstrap.

### 3.3. Frontend runtime

Frontend là React SPA được build và serve bởi Vite. `fe/src/api.ts` là HTTP client dùng Fetch API, tự gắn Bearer access token, thử refresh một lần khi nhận `401`, hủy các query đọc dữ liệu cũ bằng `AbortSignal` khi điều hướng, filter hoặc location đổi liên tục, rồi xóa session nếu refresh thất bại. Access token, refresh token và user hiện tại được giữ trong `sessionStorage`.

Frontend theme dùng `system | light | dark`, lưu preference ở localStorage key `ticket_booking_theme`, áp dụng `data-theme` trên `<html>`, theo dõi `prefers-color-scheme` và cập nhật `theme-color`. Design direction là CineBook Cobalt Editorial với Space Grotesk cho display và Inter cho body/data; semantic tokens được định nghĩa trong `DESIGN.md` và `fe/src/App.css`.

Admin UI có modal nhập phim từ TMDB trong màn quản lý phim. Modal gọi API backend, không gọi TMDB trực tiếp và không biết `TMDB_ACCESS_TOKEN`.

Customer UI hiện có:

- Catalog phim và tìm kiếm.
- Bộ chọn tỉnh/thành dùng reference data nội bộ; popup được render ở `document.body`, khóa scroll nền khi mở và khôi phục focus/scroll khi đóng. Catalog debounce 120ms khi đổi khu vực liên tục và hủy request cũ bằng `AbortSignal`.
- Chọn suất chiếu và sơ đồ ghế.
- Hold tối đa 10 ghế bằng `Idempotency-Key`; booking giữ ghế 10 phút khi suất còn hơn 15 phút và 2 phút khi còn từ 5 đến 15 phút.
- Khi server xác nhận booking đã `EXPIRED`, frontend nhả cache booking/sơ đồ ghế và dùng điều hướng thay thế về đúng sơ đồ ghế để người dùng chọn lại; trang ghế hiển thị thông báo phiên giữ ghế đã hết hạn một lần.
- Không nhận hold mới khi suất chiếu còn tối đa 5 phút; client hiển thị lỗi suất quá gần giờ chiếu.
- Checkout SePay bằng mã QR/chuyển khoản và nhận webhook xác nhận thanh toán.
- Booking history và ticket history.
- Login/register và logout; nút logout dùng màu violet ở trạng thái thường và đỏ trầm khi hover.

### 3.4. Repository layout

```text
.
├── package.json
├── README.md
├── be/
│   ├── package.json
│   ├── docker-compose.yml
│   ├── prisma/
│   └── src/
└── fe/
    ├── package.json
    └── src/
```

## 4. Cấu hình môi trường

Backend file mẫu: `be/.env.example`. Frontend file mẫu: `fe/.env.example`.

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://ticket_booking:ticket_booking@localhost:5432/ticket_booking?schema=public
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=local-access-secret-change-me-32-chars-minimum
JWT_REFRESH_SECRET=local-refresh-secret-change-me-32-chars-minimum
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=CineBook <no-reply@example.com>
PUBLIC_APP_URL=http://localhost:5173
MAIL_WORKER_ENABLED=true
MAIL_WORKER_POLL_MS=10000
MAIL_WORKER_STALE_LOCK_MS=300000
MAIL_WORKER_SHUTDOWN_TIMEOUT_MS=15000
TMDB_ACCESS_TOKEN=<tmdb-api-read-access-token>
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=change-this-seed-password
```

| Biến                     | Bắt buộc | Mô tả                                                          |
| ------------------------ | -------- | -------------------------------------------------------------- |
| `NODE_ENV`               | Không    | `development`, `test` hoặc `production`; default `development` |
| `PORT`                   | Không    | Port HTTP; `main.ts` fallback về `3000` nếu không hợp lệ       |
| `DATABASE_URL`           | Có       | PostgreSQL connection string dùng bởi Prisma                   |
| `REDIS_URL`              | Có       | Redis URL, phải dùng protocol `redis`                          |
| `JWT_ACCESS_SECRET`      | Có       | Secret ký access token                                         |
| `JWT_REFRESH_SECRET`     | Có       | Secret ký refresh token; phải khác access secret               |
| `JWT_ACCESS_EXPIRES_IN`  | Không    | TTL access token, default `15m`                                |
| `JWT_REFRESH_EXPIRES_IN` | Không    | TTL refresh token, default `7d`                                |
| `SMTP_HOST`              | Không    | Host SMTP provider                                              |
| `SMTP_PORT`              | Không    | Port SMTP provider, thường `587` hoặc `465`                    |
| `SMTP_SECURE`            | Không    | Bật TLS trực tiếp khi là `true`                                |
| `SMTP_USER`              | Không    | SMTP username nếu provider yêu cầu                             |
| `SMTP_PASSWORD`          | Không    | SMTP password nếu provider yêu cầu                             |
| `SMTP_FROM`              | Không    | Địa chỉ gửi email                                               |
| `PUBLIC_APP_URL`         | Không    | Base URL frontend dùng trong link xác thực và link xem vé     |
| `MAIL_WORKER_ENABLED`    | Không    | Bật Worker Thread gửi mail; test/OpenAPI nên để `false`       |
| `MAIL_WORKER_POLL_MS`    | Không    | Chu kỳ polling fallback khi outbox rỗng, default `10000`      |
| `MAIL_WORKER_STALE_LOCK_MS` | Không | Thời gian reclaim lock PROCESSING, default `300000`           |
| `MAIL_WORKER_SHUTDOWN_TIMEOUT_MS` | Không | Timeout graceful shutdown, default `15000`              |
| `TMDB_ACCESS_TOKEN`      | Không    | TMDB API Read Access Token; cần nếu Admin tìm hoặc nhập phim  |
| `SEED_ADMIN_EMAIL`       | Seed     | Email admin bootstrap, default `admin@example.com`             |
| `SEED_ADMIN_PASSWORD`    | Seed     | Password admin bootstrap, bắt buộc khi seed                    |
| `SEPAY_BANK_CODE`        | Không    | Mã ngân hàng SePay/VietQR (ví dụ: `MB`, `VCB`, `ACB`)          |
| `SEPAY_ACCOUNT_NUMBER`   | Không    | Số tài khoản ngân hàng nhận tiền                              |
| `SEPAY_ACCOUNT_NAME`     | Không    | Tên chủ tài khoản nhận tiền                                    |
| `SEPAY_WEBHOOK_API_KEY`  | Không    | Khóa xác thực webhook từ SePay (header `Authorization: Apikey <KEY>`) |

### Security rules

- Không commit `.env` thật.
- Không lưu plaintext password hoặc refresh token.
- Production yêu cầu mỗi JWT secret dài tối thiểu 32 ký tự.
- Access và refresh secret phải khác nhau.
- `TMDB_ACCESS_TOKEN` chỉ nằm ở backend `.env`; không truyền token sang frontend hoặc commit vào repository.
- TMDB là nguồn dữ liệu ngoài. Chỉ phim đã được Admin nhập vào catalog nội bộ mới có thể publish, tạo showtime và booking.

## 5. Database data dictionary

Nguồn chính: `be/prisma/schema.prisma`.

### 5.1. Quy ước

- `REQ`: bắt buộc, database `NOT NULL`.
- `OPT`: nullable.
- `PK`: primary key.
- `UQ`: unique constraint/index.
- `IDX`: index.
- `FK`: foreign key.
- Relation field dạng `Model[]` hoặc `Model?` là relation Prisma, không phải column vật lý độc lập.
- Prisma `Decimal` được serialize trong JSON dưới dạng chuỗi, ví dụ `"100000.00"`.

### 5.2. Enum dictionary

#### `UserRole`

| Giá trị    | Ý nghĩa           |
| ---------- | ----------------- |
| `CUSTOMER` | Người dùng đặt vé |
| `ADMIN`    | Quản lý catalog   |

#### `MovieStatus`

| Giá trị     | Ý nghĩa                          |
| ----------- | -------------------------------- |
| `DRAFT`     | Chưa public                      |
| `PUBLISHED` | Được hiển thị và dùng để booking |
| `ARCHIVED`  | Đã archive, không public         |

#### `SeatType`

| Giá trị    | Ý nghĩa    |
| ---------- | ---------- |
| `STANDARD` | Ghế thường |
| `VIP`      | Ghế VIP    |
| `COUPLE`   | Ghế đôi    |

#### `RoomFormat`

| Giá trị | Ý nghĩa |
| ------- | ------- |
| `STANDARD` | Phòng tiêu chuẩn |
| `IMAX` | Phòng IMAX |
| `FOUR_DX` | Phòng 4DX |
| `SCREEN_X` | Phòng ScreenX |

#### `ShowtimeFormat`

| Giá trị | Ý nghĩa |
| ------- | ------- |
| `TWO_D_SUBTITLED` | 2D phụ đề |
| `TWO_D_DUBBED` | 2D lồng tiếng |
| `THREE_D_SUBTITLED` | 3D phụ đề |
| `THREE_D_DUBBED` | 3D lồng tiếng |

#### `ShowtimeSeatStatus`

| Giá trị     | Ý nghĩa               |
| ----------- | --------------------- |
| `AVAILABLE` | Có thể hold           |
| `HELD`      | Đang được booking giữ |
| `SOLD`      | Đã bán                |

#### `BookingStatus`

| Giá trị     | Ý nghĩa                     |
| ----------- | --------------------------- |
| `PENDING`   | Đang giữ ghế/chờ thanh toán |
| `CONFIRMED` | Thanh toán thành công       |
| `CANCELLED` | Bị hủy                      |
| `EXPIRED`   | Hết thời gian giữ           |

#### `PaymentStatus`

| Giá trị     | Ý nghĩa                                    |
| ----------- | ------------------------------------------ |
| `PENDING`   | Checkout tạo payment nhưng chưa có kết quả |
| `SUCCEEDED` | Thanh toán thành công                      |
| `FAILED`    | Thanh toán thất bại                        |
| `REFUNDED`  | Dành cho refund tương lai                  |

#### `TicketStatus`

| Giá trị     | Ý nghĩa           |
| ----------- | ----------------- |
| `ACTIVE`    | Vé có thể sử dụng |
| `USED`      | Đã sử dụng        |
| `CANCELLED` | Vé đã hủy         |

### 5.3. Bảng `User`

Nguồn: `be/prisma/schema.prisma`, model `User`.

| Field           | Type             | Nullability | Default/constraint | Mô tả                                |
| --------------- | ---------------- | ----------- | ------------------ | ------------------------------------ |
| `id`            | `String`         | REQ         | PK, `cuid()`       | ID nội bộ                            |
| `email`         | `String`         | REQ         | UQ                 | Email đăng nhập, normalize lowercase |
| `passwordHash`  | `String`         | REQ         | —                  | Hash bằng scrypt                     |
| `fullName`      | `String`         | REQ         | —                  | Tên hiển thị                         |
| `role`          | `UserRole`       | REQ         | `CUSTOMER`         | Quyền user                           |
| `emailVerifiedAt` | `DateTime?`    | OPT         | `NULL`              | Thời điểm xác thực email              |
| `bookings`      | `Booking[]`      | Relation    | —                  | Các booking của user                 |
| `refreshTokens` | `RefreshToken[]` | Relation    | —                  | Các session refresh token            |
| `createdAt`     | `DateTime`       | REQ         | `now()`            | Thời điểm tạo                        |
| `updatedAt`     | `DateTime`       | REQ         | `@updatedAt`       | Thời điểm cập nhật                   |

### 5.4. Bảng `Movie`

| Field         | Type          | Nullability | Default/constraint | Mô tả                   |
| ------------- | ------------- | ----------- | ------------------ | ----------------------- |
| `id`          | `String`      | REQ         | PK, `cuid()`       | ID phim nội bộ          |
| `tmdbId`      | `Int?`        | OPT         | UQ                 | ID phim trên TMDB       |
| `title`       | `String`      | REQ         | —                  | Tên phim                |
| `description` | `String?`     | OPT         | —                  | Mô tả phim              |
| `posterUrl`   | `String?`     | OPT         | —                  | URL poster phim         |
| `backdropUrl` | `String?`     | OPT         | —                  | URL backdrop phim         |
| `trailerKey`  | `String?`     | OPT         | —                  | YouTube video key         |
| `releaseDate` | `DateTime?`   | OPT         | —                  | Ngày khởi chiếu           |
| `rating`      | `Decimal?`    | OPT         | `0..10`, 1 chữ số thập phân | Điểm TMDB               |
| `genres`      | `String[]`    | REQ         | `[]`                  | Danh sách thể loại         |
| `ageRating`   | `String?`     | OPT         | —                     | Phân loại độ tuổi          |
| `duration`    | `Int`         | REQ         | —                  | Thời lượng, đơn vị phút |
| `status`      | `MovieStatus` | REQ         | `DRAFT`            | Lifecycle phim          |
| `showtimes`   | `Showtime[]`  | Relation    | —                  | Các suất chiếu          |
| `createdAt`   | `DateTime`    | REQ         | `now()`            | Thời điểm tạo           |
| `updatedAt`   | `DateTime`    | REQ         | `@updatedAt`       | Thời điểm cập nhật      |

### 5.5. Bảng `Cinema`

| Field          | Type       | Nullability | Default/constraint | Mô tả                       |
| -------------- | ---------- | ----------- | ------------------ | --------------------------- |
| `id`           | `String`   | REQ         | PK, `cuid()`       | ID rạp                      |
| `name`         | `String`   | REQ         | —                  | Tên rạp                     |
| `address`      | `String`   | REQ         | —                  | Địa chỉ chi tiết            |
| `provinceCode` | `Int`      | REQ         | default `79`, check 34 mã | Mã tỉnh/thành của rạp       |
| `rooms`        | `Room[]`   | Relation    | —                  | Các phòng chiếu             |
| `createdAt`    | `DateTime` | REQ         | `now()`            | Thời điểm tạo               |
| `updatedAt`    | `DateTime` | REQ         | `@updatedAt`       | Thời điểm cập nhật          |

Public cinema list response tính thêm `startingPrice` là giá `basePrice` thấp nhất của các suất chiếu tương lai trong cụm rạp; đây không phải column của `Cinema`.
| `updatedAt`    | `DateTime` | REQ         | `@updatedAt`       | Thời điểm cập nhật           |

Cinema hiện không có unique constraint trên `name` hoặc `address`.

### 5.6. Bảng `Room`

| Field       | Type         | Nullability | Default/constraint            | Mô tả                  |
| ----------- | ------------ | ----------- | ----------------------------- | ---------------------- |
| `id`        | `String`     | REQ         | PK, `cuid()`                  | ID phòng               |
| `name`      | `String`     | REQ         | Kết hợp unique với `cinemaId` | Tên phòng trong rạp    |
| `cinemaId`  | `String`         | REQ         | FK → `Cinema.id`              | Rạp sở hữu phòng    |
| `format`    | `RoomFormat`     | REQ         | default `STANDARD`            | Công nghệ phòng     |
| `cinema`    | `Cinema`         | Relation    | `onDelete: Cascade`           | Rạp cha              |
| `seats`     | `Seat[]`     | Relation    | —                             | Ghế trong phòng        |
| `showtimes` | `Showtime[]` | Relation    | —                             | Lịch chiếu trong phòng |
| `createdAt` | `DateTime`   | REQ         | `now()`                       | Thời điểm tạo          |
| `updatedAt` | `DateTime`   | REQ         | `@updatedAt`                  | Thời điểm cập nhật     |

Constraint: `@@unique([cinemaId, name])`.

### 5.7. Bảng `Seat`

| Field           | Type             | Nullability | Default/constraint  | Mô tả                      |
| --------------- | ---------------- | ----------- | ------------------- | -------------------------- |
| `id`            | `String`         | REQ         | PK, `cuid()`        | ID ghế vật lý              |
| `row`           | `String`         | REQ         | —                   | Hàng ghế, ví dụ `A`        |
| `number`        | `Int`            | REQ         | —                   | Số ghế trong hàng          |
| `type`          | `SeatType`       | REQ         | `STANDARD`          | Loại ghế                   |
| `roomId`        | `String`         | REQ         | FK → `Room.id`      | Phòng chứa ghế             |
| `room`          | `Room`           | Relation    | `onDelete: Cascade` | Phòng cha                  |
| `showtimeSeats` | `ShowtimeSeat[]` | Relation    | —                   | Snapshot ghế theo showtime |

Constraint: `@@unique([roomId, row, number])`.

Seat không có `createdAt`/`updatedAt`.

### 5.8. Bảng `Showtime`

| Field           | Type             | Nullability | Default/constraint   | Mô tả              |
| --------------- | ---------------- | ----------- | -------------------- | ------------------ |
| `id`            | `String`         | REQ         | PK, `cuid()`         | ID suất chiếu      |
| `startsAt`      | `DateTime`       | REQ         | —                    | Thời điểm bắt đầu  |
| `endsAt`        | `DateTime`       | REQ         | —                    | Thời điểm kết thúc |
| `movieId`       | `String`         | REQ         | FK → `Movie.id`      | Phim được chiếu    |
| `movie`         | `Movie`          | Relation    | `onDelete: Restrict` | Phim cha           |
| `roomId`        | `String`         | REQ         | FK → `Room.id`       | Phòng chiếu      |
| `format`        | `ShowtimeFormat`  | REQ         | default `TWO_D_SUBTITLED` | Định dạng trình chiếu |
| `basePrice`     | `Decimal`        | REQ         | `>= 0`               | Giá ghế Standard trước multiplier |
| `vipMultiplier` | `Decimal`        | REQ         | default `1.1`, `>= 0` | Hệ số giá VIP |
| `coupleMultiplier` | `Decimal`     | REQ         | default `1.2`, `>= 0` | Hệ số giá Couple sau VIP |
| `room`          | `Room`           | Relation    | `onDelete: Restrict` | Phòng cha          |
| `showtimeSeats` | `ShowtimeSeat[]` | Relation    | —                    | Ghế snapshot       |
| `bookings`      | `Booking[]`      | Relation    | —                    | Booking của suất   |
| `createdAt`     | `DateTime`       | REQ         | `now()`              | Thời điểm tạo      |
| `updatedAt`     | `DateTime`       | REQ         | `@updatedAt`         | Thời điểm cập nhật |

Indexes:

- `@@index([movieId, startsAt])`.
- `@@index([roomId, startsAt, endsAt])`.

Database constraints trong migration:

- `startsAt < endsAt`.
- Exclusion constraint không cho overlap trong cùng room với khoảng `[startsAt, endsAt)`. Hai suất liền kề được phép.

### 5.9. Bảng `ShowtimeSeat`

Đây là snapshot của một ghế vật lý trong một suất chiếu. Booking luôn thao tác trên bảng này, không thao tác trực tiếp trên `Seat`.

| Field             | Type                 | Nullability | Default/constraint   | Mô tả                    |
| ----------------- | -------------------- | ----------- | -------------------- | ------------------------ |
| `id`              | `String`             | REQ         | PK, `cuid()`         | ID ghế theo suất         |
| `price`           | `Decimal(10,2)`      | REQ         | `>= 0`               | Giá ghế tại showtime     |
| `status`          | `ShowtimeSeatStatus` | REQ         | `AVAILABLE`          | Trạng thái bán           |
| `heldUntil`       | `DateTime?`          | OPT         | —                    | Thời điểm hold hết hạn   |
| `showtimeId`      | `String`             | REQ         | FK → `Showtime.id`   | Suất chiếu               |
| `showtime`        | `Showtime`           | Relation    | `onDelete: Cascade`  | Suất cha                 |
| `seatId`          | `String`             | REQ         | FK → `Seat.id`       | Ghế vật lý               |
| `seat`            | `Seat`               | Relation    | `onDelete: Restrict` | Ghế cha                  |
| `bookingItems`    | `BookingItem[]`      | Relation    | —                    | Lịch sử item             |
| `heldByBookingId` | `String?`            | OPT         | FK → `Booking.id`    | Booking đang sở hữu hold |
| `heldByBooking`   | `Booking?`           | Relation    | `SetNull`            | Booking owner của hold   |

Constraints/indexes:

- `@@unique([showtimeId, seatId])`.
- `@@index([showtimeId, status])`.
- `@@index([heldByBookingId])`.
- Nếu `status = HELD`, `heldUntil` và `heldByBookingId` phải khác null.
- Nếu `status != HELD`, hai field hold phải null.

### 5.10. Bảng `RefreshToken`

| Field       | Type        | Nullability | Default/constraint  | Mô tả                  |
| ----------- | ----------- | ----------- | ------------------- | ---------------------- |
| `id`        | `String`    | REQ         | PK, `cuid()`        | ID record database     |
| `jti`       | `String`    | REQ         | UQ                  | JWT ID nằm trong token |
| `tokenHash` | `String`    | REQ         | —                   | Hash refresh token     |
| `expiresAt` | `DateTime`  | REQ         | —                   | Hạn token              |
| `revokedAt` | `DateTime?` | OPT         | —                   | Thời điểm revoke       |
| `userId`    | `String`    | REQ         | FK → `User.id`      | User sở hữu token      |
| `user`      | `User`      | Relation    | `onDelete: Cascade` | User cha               |
| `createdAt` | `DateTime`  | REQ         | `now()`             | Thời điểm tạo          |

Indexes:

- `jti` unique.
- `@@index([userId, revokedAt])`.
- `@@index([expiresAt])`.

`id` là ID nội bộ; `jti` là ID của token trong JWT và được dùng để lookup/revoke đúng session.

### 5.11. Bảng `Booking`

| Field            | Type             | Nullability | Default/constraint    | Mô tả                        |
| ---------------- | ---------------- | ----------- | --------------------- | ---------------------------- |
| `id`             | `String`         | REQ         | PK, `cuid()`          | ID booking                   |
| `status`         | `BookingStatus`  | REQ         | `PENDING`             | Lifecycle booking            |
| `totalAmount`    | `Decimal(10,2)`  | REQ         | `>= 0`                | Tổng tiền server tính        |
| `expiresAt`      | `DateTime`       | REQ         | —                     | Hạn giữ ghế                  |
| `holdToken`      | `String`         | REQ         | —                     | Token nội bộ release Redis   |
| `idempotencyKey` | `String?`        | OPT         | Nullable UQ theo user | Key retry hold               |
| `requestHash`    | `String?`        | OPT         | —                     | Fingerprint showtime + seats |
| `userId`         | `String`         | REQ         | FK → `User.id`        | User tạo booking             |
| `user`           | `User`           | Relation    | `onDelete: Restrict`  | User cha                     |
| `showtimeId`     | `String`         | REQ         | FK → `Showtime.id`    | Suất chiếu                   |
| `showtime`       | `Showtime`       | Relation    | `onDelete: Restrict`  | Suất cha                     |
| `items`          | `BookingItem[]`  | Relation    | —                     | Các ghế đã chọn              |
| `heldSeats`      | `ShowtimeSeat[]` | Relation    | `BookingSeatHolds`    | Ghế booking đang hold        |
| `payment`        | `Payment?`       | Relation    | Tối đa một payment    |
| `tickets`        | `Ticket[]`       | Relation    | —                     | Vé phát hành                 |
| `createdAt`      | `DateTime`       | REQ         | `now()`               | Thời điểm tạo                |
| `updatedAt`      | `DateTime`       | REQ         | `@updatedAt`          | Thời điểm cập nhật           |

Constraints/indexes:

- `@@unique([userId, idempotencyKey])`.
- `@@index([holdToken])`.
- `@@index([userId, createdAt])`.
- `@@index([status, expiresAt])`.
- `totalAmount >= 0`.

### 5.12. Bảng `BookingItem`

| Field            | Type            | Nullability | Default/constraint     | Mô tả                    |
| ---------------- | --------------- | ----------- | ---------------------- | ------------------------ |
| `id`             | `String`        | REQ         | PK, `cuid()`           | ID item                  |
| `price`          | `Decimal(10,2)` | REQ         | `>= 0`                 | Giá snapshot tại booking |
| `bookingId`      | `String`        | REQ         | FK → `Booking.id`      | Booking cha              |
| `booking`        | `Booking`       | Relation    | `onDelete: Cascade`    | Booking                  |
| `showtimeSeatId` | `String`        | REQ         | FK → `ShowtimeSeat.id` | Ghế theo suất            |
| `showtimeSeat`   | `ShowtimeSeat`  | Relation    | `onDelete: Restrict`   | Showtime seat            |
| `ticket`         | `Ticket?`       | Relation    | Tối đa một ticket      |

Constraint: `@@unique([bookingId, showtimeSeatId])`.

Unique này không cấm ghế xuất hiện trong booking lịch sử khác; nó chỉ cấm duplicate cùng ghế trong cùng một booking.

### 5.13. Bảng `Payment`

| Field            | Type            | Nullability | Default/constraint    | Mô tả                   |
| ---------------- | --------------- | ----------- | --------------------- | ----------------------- |
| `id`             | `String`        | REQ         | PK, `cuid()`          | ID payment              |
| `provider`      | `String`        | REQ         | —                     | Hiện tại `SEPAY`        |
| `reference`     | `String?`       | OPT         | UQ                    | Reference phía provider |
| `status`         | `PaymentStatus` | REQ         | `PENDING`             | Trạng thái giao dịch    |
| `amount`         | `Decimal(10,2)` | REQ         | `>= 0`                | Số tiền thanh toán      |
| `bookingId`      | `String`        | REQ         | UQ, FK → `Booking.id` | Booking được thanh toán |
| `booking`        | `Booking`       | Relation    | `onDelete: Restrict`  | Booking                 |
| `createdAt`      | `DateTime`      | REQ         | `now()`               | Thời điểm tạo           |
| `updatedAt`      | `DateTime`      | REQ         | `@updatedAt`          | Thời điểm cập nhật      |

Một booking tối đa có một Payment. Reference SePay là unique khi provider gửi reference.

### 5.14. Bảng `Ticket`

| Field           | Type           | Nullability | Default/constraint        | Mô tả             |
| --------------- | -------------- | ----------- | ------------------------- | ----------------- |
| `id`            | `String`       | REQ         | PK, `cuid()`              | ID ticket         |
| `code`          | `String`       | REQ         | UQ                        | Mã vé public      |
| `status`        | `TicketStatus` | REQ         | `ACTIVE`                  | Trạng thái vé     |
| `bookingId`     | `String`       | REQ         | FK → `Booking.id`         | Booking cha       |
| `booking`       | `Booking`      | Relation    | `onDelete: Restrict`      | Booking           |
| `bookingItemId` | `String`       | REQ         | UQ, FK → `BookingItem.id` | Item tạo ticket   |
| `bookingItem`   | `BookingItem`  | Relation    | `onDelete: Restrict`      | Item              |
| `createdAt`     | `DateTime`     | REQ         | `now()`                   | Thời điểm tạo     |
| `usedAt`        | `DateTime?`    | OPT         | —                         | Thời điểm sử dụng |

Hiện schema có `USED`/`CANCELLED`, nhưng chưa có API consume/cancel ticket.

Frontend tạo QR vé cục bộ từ chuỗi versioned `cinebook-ticket:v1:<ticket.code>` bằng thư viện QR chuẩn. QR luôn hiển thị trong chi tiết vé để khách xuất trình tại rạp; hệ thống hiện chưa có camera scanner, endpoint consume hoặc luồng check-in Admin. Nút “Xem mã soát vé” chỉ cuộn tới QR, không thay đổi trạng thái vé.

### 5.15. ERD

```mermaid
erDiagram
    User ||--o{ Booking : creates
    User ||--o{ RefreshToken : owns
    Movie ||--o{ Showtime : schedules
    Cinema ||--o{ Room : contains
    Room ||--o{ Seat : contains
    Room ||--o{ Showtime : hosts
    Showtime ||--o{ ShowtimeSeat : materializes
    Seat ||--o{ ShowtimeSeat : maps
    Booking ||--o{ BookingItem : contains
    Booking ||--o{ ShowtimeSeat : holds
    ShowtimeSeat ||--o{ BookingItem : booking_history
    Booking ||--o| Payment : has
    Booking ||--o{ Ticket : issues
    BookingItem ||--o| Ticket : produces

    User {
        String id PK
        String email UK
        String passwordHash
        String fullName
        UserRole role
        DateTime createdAt
        DateTime updatedAt
    }
    Movie {
        String id PK
        Int tmdbId UK
        String title
        String description
        String posterUrl
        String backdropUrl
        Int duration
        MovieStatus status
        DateTime createdAt
        DateTime updatedAt
    }
    Cinema {
        String id PK
        String name
        String address
        DateTime createdAt
        DateTime updatedAt
    }
    Room {
        String id PK
        String name
        String cinemaId FK
        DateTime createdAt
        DateTime updatedAt
    }
    Seat {
        String id PK
        String row
        Int number
        SeatType type
        String roomId FK
    }
    Showtime {
        String id PK
        DateTime startsAt
        DateTime endsAt
        String movieId FK
        String roomId FK
        DateTime createdAt
        DateTime updatedAt
    }
    ShowtimeSeat {
        String id PK
        Decimal price
        ShowtimeSeatStatus status
        DateTime heldUntil
        String showtimeId FK
        String seatId FK
        String heldByBookingId FK
    }
    RefreshToken {
        String id PK
        String jti UK
        String tokenHash
        DateTime expiresAt
        DateTime revokedAt
        String userId FK
        DateTime createdAt
    }
    Booking {
        String id PK
        BookingStatus status
        Decimal totalAmount
        DateTime expiresAt
        String holdToken
        String idempotencyKey
        String requestHash
        String userId FK
        String showtimeId FK
        DateTime createdAt
        DateTime updatedAt
    }
    BookingItem {
        String id PK
        Decimal price
        String bookingId FK
        String showtimeSeatId FK
    }
    Payment {
        String id PK
        String provider
        String reference UK
        PaymentStatus status
        Decimal amount
        String bookingId FK, UK
        DateTime createdAt
        DateTime updatedAt
    }
    Ticket {
        String id PK
        String code UK
        TicketStatus status
        String bookingId FK
        String bookingItemId FK, UK
        DateTime createdAt
        DateTime usedAt
    }
```

#### Hai quan hệ giữa `Booking` và `ShowtimeSeat`

`ShowtimeSeat` liên quan tới `Booking` theo hai đường khác nhau:

1. **Active hold:** `Booking.heldSeats` ↔ `ShowtimeSeat.heldByBookingId`.
   - Đại diện booking đang giữ ghế ở thời điểm hiện tại.
   - Một `ShowtimeSeat` chỉ có tối đa một `heldByBookingId`.
   - Khi booking bị cancel/expire hoặc payment thành công, hold được xóa bằng cách set `heldByBookingId = null`.
   - Foreign key dùng `onDelete: SetNull`, nên xóa booking không làm xóa ghế theo suất.
2. **Booking history:** `Booking.items` → `BookingItem.showtimeSeat`.
   - Lưu lịch sử ghế đã được chọn trong booking.
   - Một `ShowtimeSeat` có thể xuất hiện trong nhiều `BookingItem` thuộc các booking khác nhau theo thời gian.
   - Cùng một booking không thể chứa cùng `ShowtimeSeat` hai lần nhờ unique `(bookingId, showtimeSeatId)`.

Vì vậy ERD có cả hai đường `Booking -> ShowtimeSeat` và `Booking -> BookingItem -> ShowtimeSeat`; chúng không trùng ý nghĩa.

### 5.16. State diagrams

#### Showtime seat

```mermaid
stateDiagram-v2
    [*] --> AVAILABLE
    AVAILABLE --> HELD: Hold booking
    HELD --> SOLD: Payment succeeds
    HELD --> AVAILABLE: Cancel, payment fails, or expires
    SOLD --> SOLD: Read-only after purchase
```

#### Booking

```mermaid
stateDiagram-v2
    [*] --> PENDING: Hold seats
    PENDING --> CONFIRMED: Payment succeeds
    PENDING --> CANCELLED: User cancel or payment fails
    PENDING --> EXPIRED: expiresAt reached
    CONFIRMED --> [*]
    CANCELLED --> [*]
    EXPIRED --> [*]
```

#### Payment

```mermaid
stateDiagram-v2
    [*] --> PENDING: Checkout
    PENDING --> SUCCEEDED: Provider/mock success
    PENDING --> FAILED: Provider/mock failure or booking expires
    SUCCEEDED --> REFUNDED: Future refund flow
    SUCCEEDED --> SUCCEEDED: Idempotent retry
    FAILED --> FAILED: Idempotent retry
```

### 5.17. Quan hệ và onDelete

| Quan hệ                                 | Cardinality  | onDelete |
| --------------------------------------- | ------------ | -------- |
| `User -> Booking`                       | 1-N          | Restrict |
| `User -> RefreshToken`                  | 1-N          | Cascade  |
| `Movie -> Showtime`                     | 1-N          | Restrict |
| `Cinema -> Room`                        | 1-N          | Cascade  |
| `Room -> Seat`                          | 1-N          | Cascade  |
| `Room -> Showtime`                      | 1-N          | Restrict |
| `Showtime -> ShowtimeSeat`              | 1-N          | Cascade  |
| `Seat -> ShowtimeSeat`                  | 1-N          | Restrict |
| `Showtime -> Booking`                   | 1-N          | Restrict |
| `Booking -> BookingItem`                | 1-N          | Cascade  |
| `ShowtimeSeat -> BookingItem`           | 1-N          | Restrict |
| `Booking -> Payment`                    | 1-0/1        | Restrict |
| `Booking -> Ticket`                     | 1-N          | Restrict |
| `BookingItem -> Ticket`                 | 1-0/1        | Restrict |
| `Booking -> ShowtimeSeat.heldByBooking` | 1-N optional | SetNull  |

## 6. Migration và seed

### 6.1. Migration history

#### `20260904085503_init`

Tạo schema ban đầu:

- Các enum nghiệp vụ.
- Các bảng `User`, `Movie`, `Cinema`, `Room`, `Seat`, `Showtime`, `ShowtimeSeat`, `Booking`, `BookingItem`, `Payment`, `Ticket`.
- Primary key, relation, unique/index cơ bản.
- Chưa có refresh token, seat state hoặc booking hold token.
- `BookingItem.showtimeSeatId` ban đầu có unique toàn cục.

#### `20260907100000_booking_flow`

Bổ sung booking flow:

- Enum `ShowtimeSeatStatus`.
- `ShowtimeSeat.status`, `heldUntil`, `heldByBookingId`.
- `Booking.holdToken`, `idempotencyKey`, `requestHash`.
- `Payment.reference`.
- `SepayTransaction.sepayId`.
- Bảng `RefreshToken`.
- Bỏ unique toàn cục trên `BookingItem.showtimeSeatId`.
- Thêm unique cùng booking trên `(bookingId, showtimeSeatId)`.
- Thêm check constraint giá/tổng tiền/trạng thái hold.
- Thêm exclusion constraint chống showtime overlap.
- Backfill booking pending/confirmed/cancelled/expired và seat/payment state cũ.

#### `20260915120000_admin_catalog_controls`

Bổ sung các trường điều khiển catalog và pricing cho Admin:

- `Movie.posterUrl` và `Movie.backdropUrl`.
- `Showtime.basePrice`, `vipMultiplier` và `coupleMultiplier`.
- Check constraint không cho giá âm.

#### `20260915150000_tmdb_movie_import`

Bổ sung liên kết phim nội bộ với TMDB:

- Thêm `Movie.tmdbId`, kiểu `Int?`.
- Tạo unique index `Movie_tmdbId_key`.
- Không backfill phim cũ vì phim seed/thủ công không có TMDB ID.
- Phim import từ TMDB luôn được tạo với `status = DRAFT`.

#### `20260916100000_location_and_trailers`

Bổ sung location context và trailer cho catalog:

- Thêm `Movie.trailerKey`, kiểu `String?`, chỉ lưu YouTube video key.
- Thêm `Cinema.provinceCode`, backfill dữ liệu cũ về mã `79` (TP. Hồ Chí Minh).
- Tạo index `Cinema_provinceCode_idx`.
- Thêm check constraint giới hạn `provinceCode` trong 34 mã tỉnh/thành sau sáp nhập 07/2025.
- Reference data 34 tỉnh/thành được phục vụ nội bộ qua `GET /api/v1/locations/provinces`.

#### `20260924130000_room_showtime_formats_and_pricing`

Bổ sung phân loại phòng/suất và chuẩn hóa giá theo từng suất:

- Thêm enum `RoomFormat` và `ShowtimeFormat`.
- Backfill phòng cũ thành `STANDARD`, suất cũ thành `TWO_D_SUBTITLED`.
- Backfill `Showtime.basePrice` bằng giá ghế snapshot thấp nhất; multiplier mặc định là `1.10` và `1.20`.
- Migration dừng rõ ràng nếu showtime không có snapshot giá ghế để tránh tạo giá không xác định.
- Sau migration, các trường pricing và format của showtime là bắt buộc trong database.

#### `20260924140000_validate_showtime_snapshots`

- Kiểm tra mỗi showtime có snapshot giá cho đầy đủ mọi ghế vật lý của room trước khi hệ thống tiếp tục vận hành.
- Migration fail rõ ràng nếu snapshot thiếu ghế, tránh dữ liệu booking không thể định giá.

#### `20260925100000_email_verification_and_mail_outbox`

- Thêm `User.emailVerifiedAt`; user hiện có được backfill là đã xác thực.
- Thêm token xác thực email dùng một lần với hash, expiry và `consumedAt`.
- Thêm `MailOutbox` để gửi email bất đồng bộ, dedupe theo nghiệp vụ và retry khi SMTP lỗi.
- Mail worker chạy trong Node.js Worker Thread riêng, không dùng Nest `@Cron`; worker xử lý drain liên tục, sleep bằng polling fallback khi rỗng, và nhận `wake` sau khi transaction tạo outbox commit.
- Worker có graceful shutdown, restart với backoff khi crash, stale-lock recovery, stable `Message-ID` theo outbox và readiness status.
- Email xác thực tài khoản dùng template CineBook Cobalt Editorial HTML/table inline CSS và plain-text fallback. Email vé gồm thông tin phim/rạp/suất, tổng tiền, từng mã vé, QR inline CID và link xem vé.

### 6.2. Seed

File: `be/prisma/seed.ts`.

Seed chạy idempotent bằng `upsert`:

- Admin:
  - Email từ `SEED_ADMIN_EMAIL`, default `admin@example.com`.
  - Password từ `SEED_ADMIN_PASSWORD`, bắt buộc.
  - Role `ADMIN`.
- Movie:
  - ID `seed-movie-interstellar`.
  - `Interstellar`, duration `169`, status `PUBLISHED`.
- Cinema, room và layout ghế:
  - Đọc từ `be/prisma/data/cinemas.seed.json`.
  - File nguồn hiện chứa 50 cinema và mỗi cinema có một room mặc định; seed runtime bổ sung ba format còn thiếu.
  - Cinema chỉ lưu `id`, `name`, `address`, `provinceCode`; `startingPrice` là giá tính động từ showtime, không lưu trong seed.
    - Seed tự bổ sung đủ một room cho mỗi format `STANDARD`, `IMAX`, `FOUR_DX`, `SCREEN_X`; room đã có showtime không bị đổi format hoặc reset ghế.
    - Room có `format` tùy chọn trong dữ liệu seed, mặc định `STANDARD`.
   - Layout tạo 3 hàng đầu `STANDARD`, các hàng giữa `VIP`, hàng cuối `COUPLE`.
  - Hàng Couple luôn có số ghế chẵn; các ghế ghép cặp theo `1-2`, `3-4`, `5-6`.
- Showtime demo dùng cinema và room đầu tiên trong file seed tĩnh.
- Khi chạy lại seed, layout chỉ được làm mới ở room chưa có showtime. Cinema/room seed cũ thuộc các namespace `cinema-`, `seed-cinema-`, `room-` hoặc `seed-room-` chỉ bị dọn khi không còn showtime liên quan; dữ liệu đang được sử dụng không bị xóa.
- Showtime:
  - ID `seed-showtime-interstellar`.
  - Bắt đầu khoảng 24 giờ sau thời điểm seed.
  - Kết thúc theo duration phim.
  - Showtime seats:
    - Standard: `100000.00`.
    - VIP: `110000.00`.
    - Couple: `132000.00` cho mỗi ghế.

Seed không tạo customer, booking, payment, ticket hoặc refresh token.

### 6.3. Prisma commands

Backend dùng Prisma `6.19.3` và cấu hình seed trong `be/package.json`:

```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

Các lệnh từ repository root:

```bash
npm run prisma:generate
npm run prisma:migrate -- --name your-change
npm run prisma:deploy
npm run prisma:seed
npm run prisma:studio
```

Các lệnh trên được root `package.json` chuyển tiếp tới backend trong `be/`.

## 7. Authentication và authorization

### 7.1. Register/login

Register luôn tạo role `CUSTOMER`; client không được tự truyền role.

Response auth:

```json
{
  "user": {
    "id": "clx-user-id",
    "email": "customer@example.com",
    "fullName": "Nguyen Van A",
    "role": "CUSTOMER"
  },
  "accessToken": "<access-token>",
  "refreshToken": "<refresh-token>"
}
```

### 7.2. JWT

Access token chứa:

- `sub`: user ID.
- `email`.
- `fullName`.
- `role`.
- `type = access`.
- `issuer = ticket-booking-api`.
- `audience = ticket-booking-client`.

Refresh token chứa:

- `sub`: user ID.
- `jti`: JWT ID duy nhất.
- `type = refresh`.
- `issuer`, `audience` tương tự access token.

Cả hai dùng `HS256`.

### 7.3. Refresh token rotation

1. Verify chữ ký, algorithm, issuer, audience và expiry.
2. Lấy `jti` từ token.
3. Tìm record `RefreshToken` theo `jti`.
4. Verify hash token.
5. Kiểm tra chưa revoke/chưa hết hạn.
6. Revoke record cũ trong transaction.
7. Tạo access token mới.
8. Tạo refresh token mới và `jti` mới.
9. Hash refresh token mới rồi lưu database.
10. Trả token mới.

Nếu transaction lỗi, token cũ không bị revoke một phần.

### 7.4. Request authentication

```http
Authorization: Bearer <access-token>
```

`JwtAuthGuard`:

1. Kiểm tra Bearer token.
2. Verify JWT.
3. Load user hiện tại từ database.
4. Gắn user hiện tại vào request.

Do đó role trong database được ưu tiên; access token cũ không tiếp tục giữ quyền admin sau khi user bị hạ role.

### 7.5. Role authorization

Các API quản trị dùng:

```text
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
```

- Thiếu token/sai token: `401`.
- Đúng token nhưng thiếu role: `403`.

### 7.6. Auth diagram

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant A as Auth API
    participant G as JWT Guard
    participant DB as PostgreSQL

    C->>A: POST /auth/register or /auth/login
    A->>DB: Read or create User
    A->>A: Hash password and sign JWTs
    A->>DB: Store hashed RefreshToken
    A-->>C: accessToken + refreshToken

    C->>G: API request with Bearer accessToken
    G->>G: Verify HS256, issuer, audience, type
    G->>DB: Load current User and role
    DB-->>G: Current User
    G-->>C: Continue or return 401/403

    C->>A: POST /auth/refresh
    A->>DB: Find by jti and verify hash
    A->>DB: Revoke old token
    A->>DB: Store new hashed token
    A-->>C: Rotated token pair

    C->>A: POST /auth/logout
    A->>DB: Revoke refresh token
    A-->>C: 204 No Content
```

## 8. API reference

### 8.1. Quy ước chung

- Tất cả path bên dưới đã bao gồm `/api/v1`.
- JSON request/response dùng `Content-Type: application/json`.
- Decimal từ Prisma thường xuất hiện dưới dạng string.
- Các route `POST` không khai báo `@HttpCode` dùng `201` mặc định.
- Các route `GET`, `PATCH`, `DELETE` dùng `200` nếu thành công, trừ logout `204`.
- Các path `:id` hiện nhận string, chưa có UUID validation vì Prisma dùng `cuid()`.

### 8.2. App và health

#### `GET /api/v1`

- Auth: public.
- Response: `200`.
- Body: `Hello World!`.
- Side effect: không có.

#### `GET /api/v1/health`

- Auth: public.
- Response: `200`.
- Không kiểm tra DB/Redis.

```json
{
  "status": "ok",
  "service": "ticket-booking-api",
  "timestamp": "2026-09-07T10:00:00.000Z",
  "uptime": 123.45
}
```

#### `GET /api/v1/health/ready`

- Auth: public.
- Response `200` nếu PostgreSQL và Redis đều hoạt động.
- Response `503` nếu một dependency down.

```json
{
  "status": "ok",
  "checks": {
    "database": "up",
    "redis": "up"
  },
  "timestamp": "2026-09-07T10:00:00.000Z"
}
```

### 8.3. Auth API

#### `POST /api/v1/auth/register`

- Auth: public.
- Success: `201`.
- Body:

```json
{
  "fullName": "Nguyen Van A",
  "email": "customer@example.com",
  "password": "Password123!"
}
```

- Validation:
  - `fullName`: string, 2-100 ký tự.
  - `email`: email, tối đa 255 ký tự.
  - `password`: string, 8-128 ký tự.
- Side effect: tạo `User(CUSTOMER)`, token xác thực email và mail outbox; chưa cấp access/refresh token.
- Response: `{ "verificationRequired": true, "email": "customer@example.com" }`.
- Errors: `400`, `409` nếu email đã tồn tại.

#### `POST /api/v1/auth/email/verify`

- Auth: public.
- Body: `{ "token": "<verification-token>" }`.
- Token có hiệu lực 24 giờ và chỉ dùng một lần.
- Success: `200`, trả `{ "verified": true }`.

#### `POST /api/v1/auth/email/resend`

- Auth: public.
- Body: `{ "email": "customer@example.com" }`.
- Success luôn trả `{ "sent": true }` để không làm lộ email tồn tại; tài khoản chưa xác thực sẽ nhận mail mới nếu lần gửi trước đã cách ít nhất 60 giây. Các request sớm hơn vẫn trả success generic nhưng không tạo token hoặc mail outbox mới.

#### `POST /api/v1/auth/login`

- Auth: public.
- Success: `200`.
- Body:

```json
{
  "email": "customer@example.com",
  "password": "Password123!"
}
```

- Side effect: tạo refresh token record.
- User chưa xác thực email nhận `403 AUTH_EMAIL_NOT_VERIFIED`; credential sai nhận `401`.
- Refresh cũng bị chặn với user chưa xác thực.
- Auth modal frontend giữ email đăng nhập và cho phép gửi lại email xác thực ngay sau lỗi `AUTH_EMAIL_NOT_VERIFIED`; sau mỗi lần gửi nút bị khóa 60 giây và hiển thị đếm ngược. Thông báo thành công là `Email xác thực mới đã được gửi, vui lòng kiểm tra email`.

#### `POST /api/v1/auth/refresh`

- Auth: không cần access token.
- Success: `200`.
- Body:

```json
{
  "refreshToken": "<refresh-token>"
}
```

- Side effect: revoke token cũ, tạo token mới.
- Errors: `400`, `401` nếu token sai, hết hạn hoặc đã revoke.

#### `POST /api/v1/auth/logout`

- Auth: không cần access token; body cần refresh token đúng format.
- Success: `204 No Content`.
- Body:

```json
{
  "refreshToken": "<refresh-token>"
}
```

- Side effect: revoke refresh token.

### 8.4. Users API

#### `GET /api/v1/users/me`

- Auth: Bearer JWT.
- Role: mọi role.
- Success: `200`.
- Response không chứa `passwordHash`:

```json
{
  "id": "clx-user-id",
  "email": "customer@example.com",
  "fullName": "Nguyen Van A",
  "role": "CUSTOMER",
  "createdAt": "2026-09-07T10:00:00.000Z"
}
```

### 8.5. Locations API

#### `GET /api/v1/locations/provinces`

- Auth: public.
- Trả reference data nội bộ gồm đúng 34 tỉnh/thành Việt Nam theo cập nhật địa giới 07/2025.
- Không gọi dịch vụ tỉnh/thành bên ngoài ở runtime.
- Mỗi item gồm `code`, `name` và `codename`.
- Frontend dùng danh sách này cho bộ chọn khu vực và lưu mã tỉnh đã chọn trong `localStorage`.

### 8.6. Movies API

#### `GET /api/v1/movies`

- Auth: public.
- Chỉ trả movie `PUBLISHED`.
- `NOW_SHOWING`: có ít nhất một suất tương lai, tùy `provinceCode` nếu có.
- `COMING_SOON`: `releaseDate` lớn hơn thời điểm hiện tại; không bắt buộc đã có suất.
- `SPECIAL`: có suất tương lai trong phòng không phải `STANDARD` hoặc có định dạng `3D`.
- Response movie có `startingPrice`, là `basePrice` thấp nhất của các suất tương lai trong phạm vi tỉnh/thành.
- Query:

| Param      | Required | Ví dụ          | Mô tả                       |
| ---------- | -------- | -------------- | --------------------------- |
| `search`   | Không    | `interstellar` | Tìm title, case-insensitive |
| `page`     | Không    | `1`            | Default `1`                 |
| `provinceCode` | Không | `79` | Lọc phim có suất chiếu tương lai tại tỉnh/thành |
| `category` | Không | `NOW_SHOWING` | `NOW_SHOWING`, `COMING_SOON` hoặc `SPECIAL` |
| `pageSize` | Không    | `20`           | Default `20`, max `100`     |

- Success: `200`.

```json
{
  "data": [
    {
      "id": "clx-movie-id",
      "tmdbId": null,
      "title": "Interstellar",
      "description": "A science fiction film.",
      "posterUrl": "https://cdn.example.com/posters/interstellar.jpg",
       "backdropUrl": "https://cdn.example.com/backdrops/interstellar.jpg",
       "trailerKey": null,
       "duration": 169,
      "status": "PUBLISHED",
      "createdAt": "2026-09-07T10:00:00.000Z",
      "updatedAt": "2026-09-07T10:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

#### `GET /api/v1/movies/:id`

- Auth: public.
- Success: `200`.
- Trả movie published và các showtime tương lai, include room/cinema.
- Có thể truyền `provinceCode` để chỉ include showtime thuộc tỉnh/thành đã chọn.
- Không tìm thấy: `404`.

#### `POST /api/v1/movies`

- Auth: Bearer JWT.
- Role: `ADMIN`.
- Success: `201`.
- Body:

```json
{
  "title": "Interstellar",
  "description": "A science fiction film about space exploration.",
  "duration": 169,
  "status": "PUBLISHED"
}
```

- `status`: optional, `DRAFT | PUBLISHED | ARCHIVED`; default `DRAFT`.
- `duration`: integer 1-600 phút.
- Errors: `400`, `401`, `403`.

#### `PATCH /api/v1/movies/:id`

- Auth: Bearer JWT.
- Role: `ADMIN`.
- Success: `200`.
- Body partial giống `POST /movies`.

#### `DELETE /api/v1/movies/:id`

- Auth: Bearer JWT.
- Role: `ADMIN`.
- Success: `200`.
- Không xóa cứng; chuyển movie thành `ARCHIVED`.

#### `GET /api/v1/movies/admin`

- Auth: Bearer JWT.
- Role: `ADMIN`.
- Trả tất cả movie nội bộ, gồm `DRAFT`, `PUBLISHED` và `ARCHIVED`.
- Query dùng `search`, `page`, `pageSize` và thêm `status` để lọc lifecycle.
- Endpoint này chỉ đọc PostgreSQL, không gọi TMDB.

#### `GET /api/v1/movies/admin/tmdb`

- Auth: Bearer JWT.
- Role: `ADMIN`.
- Mục đích: tìm phim trên TMDB hoặc lấy danh sách TMDB đang chiếu để Admin chọn nhập.
- Query:

| Param    | Required | Ví dụ  | Mô tả                                      |
| -------- | -------- | ------ | ------------------------------------------ |
| `search` | Không    | `Dune` | Tìm theo title TMDB; bỏ trống dùng now playing |
| `page`   | Không    | `1`    | Trang TMDB, từ `1` đến `20`, default `1`  |

- Backend gọi TMDB v3 với Bearer `TMDB_ACCESS_TOKEN`, `language=vi-VN`, `region=VN`, `include_adult=false`.
- Khi lỗi transport tạm thời với `vi-VN`, client thử lại với `language=en-US`.
- Khi lấy detail phim, API chỉ gọi detail video `en-US` nếu detail `vi-VN` không có video YouTube phù hợp; metadata tiếng Việt vẫn được giữ lại.
- Response được chuẩn hóa, không trả raw TMDB:

```json
{
  "data": [
    {
      "tmdbId": 693134,
      "title": "Dune: Part Two",
      "description": "Paul Atreides...",
      "posterUrl": "https://image.tmdb.org/t/p/w500/poster.jpg",
      "backdropUrl": "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
      "releaseDate": "2024-02-27",
      "rating": 8.7,
      "imported": false,
      "importedMovieId": null
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

- `imported` cho biết `tmdbId` đã tồn tại trong catalog nội bộ.
- `importedMovieId` là ID nội bộ nếu phim đã được nhập.
- Errors: `400` query sai, `401/403` thiếu quyền Admin, `502/504` TMDB không kết nối được, `503` chưa cấu hình hoặc bị giới hạn.
- Endpoint không tạo hoặc cập nhật movie trong DB.

#### `PUT /api/v1/movies/admin/tmdb/:tmdbId/import`

- Auth: Bearer JWT.
- Role: `ADMIN`.
- Mục đích: lấy detail TMDB và tạo movie nội bộ.
- Ví dụ: `PUT /api/v1/movies/admin/tmdb/693134/import`.
- Không có request body.
- Backend lấy detail để có `runtime`, sau đó map:

| TMDB field       | Movie field             |
| ---------------- | ----------------------- |
| `id`             | `tmdbId`                |
| `title`          | `title`                 |
| `overview`       | `description`           |
| `poster_path`    | `posterUrl` với size `w500` |
| `backdrop_path`  | `backdropUrl` với size `w1280` |
| `release_date`   | `releaseDate`           |
| `vote_average`   | `rating`                |
| `genres[].name`  | `genres`                |
| Video YouTube official `Trailer` | `trailerKey`; ưu tiên tiếng Việt, sau đó tiếng Anh |
| `runtime`        | `duration`; fallback `120` phút nếu thiếu/không hợp lệ |
| —                | `status = DRAFT`        |

- Import idempotent theo `Movie.tmdbId`:
  - Nếu phim đã tồn tại, trả movie hiện có và `imported: false`.
  - Nếu chưa tồn tại, tạo movie và trả `imported: true`.
  - Concurrent import được bảo vệ bởi unique index; request thắng sau trả movie hiện có.
- Response:

```json
{
  "movie": {
    "id": "clx-movie-id",
    "tmdbId": 693134,
    "title": "Dune: Part Two",
    "duration": 166,
    "status": "DRAFT"
  },
  "imported": true
}
```

- `ageRating` không có nguồn thống nhất trong TMDB detail hiện tại nên Admin nhập/chỉnh sửa trường này trong Movie form.
- Phim mới nhập chưa xuất hiện trên public catalog. Admin phải cập nhật `status` thành `PUBLISHED`, sau đó tạo showtime thì customer mới có thể đặt vé.
- Errors: `400`, `401`, `403`, `404` TMDB movie không tồn tại, `409` conflict, `502/504` TMDB connection, `503` cấu hình/rate limit.

#### `PUT /api/v1/movies/admin/tmdb/:tmdbId/resync`

- Auth: Bearer JWT, role `ADMIN`; không có request body.
- Chỉ dành cho movie nội bộ đã tồn tại theo `Movie.tmdbId`.
- Lấy media/trailer mới từ TMDB và chỉ cập nhật các giá trị có sẵn: `posterUrl`, `backdropUrl`, `trailerKey`.
- Nếu TMDB thiếu poster, backdrop hoặc trailer phù hợp, giá trị hiện tại không bị xóa.
- Không thay đổi `title`, `description`, `duration`, `status` hoặc `tmdbId` đã biên tập trong CineBook.
- Response là `MovieResponseDto`; lỗi gồm `400`, `401`, `403`, `404`, `502`, `503`, `504`.

### 8.7. Cinemas API

#### `GET /api/v1/cinemas`

- Auth: public.
- Success: `200`.
- Trả cinema, `provinceCode`, thông tin tỉnh/thành, `_count.rooms` và `startingPrice`.
- `startingPrice` là `basePrice` thấp nhất của các suất chiếu tương lai trong cụm rạp; có thể `null` nếu chưa có suất tương lai.
- Query `provinceCode` là optional; nếu có chỉ trả các rạp thuộc mã tỉnh/thành hợp lệ.

#### `GET /api/v1/cinemas/:id`

- Auth: public.
- Success: `200`.
- Trả cinema, rooms và `_count.seats` của mỗi room.
- Không tìm thấy: `404`.

#### `POST /api/v1/cinemas`

- Auth: Bearer JWT.
- Role: `ADMIN`.
- Success: `201`.
- Body:

```json
{
  "name": "CGV Landmark 81",
  "address": "208 Nguyen Huu Canh, Ho Chi Minh City",
  "provinceCode": 79
}
```

#### `PATCH /api/v1/cinemas/:id`

- Auth: Bearer JWT.
- Role: `ADMIN`.
- Success: `200`.
- Body partial:

```json
{
  "name": "CGV Landmark 81 - Updated"
}
```

#### `DELETE /api/v1/cinemas/:id`

- Auth: Bearer JWT.
- Role: `ADMIN`.
- Success: `200` nếu xóa được.
- Có thể `409`/database error nếu còn relation bị restrict.

### 8.8. Rooms API

#### `GET /api/v1/rooms?cinemaId=:cinemaId`

- Auth: public.
- `cinemaId`: bắt buộc, non-empty string.
- Success: `200`.
- Trả room và `_count.seats`.

#### `GET /api/v1/rooms/:id`

- Auth: public.
- Success: `200`.
- Trả room, cinema và danh sách seats.
- Không tìm thấy: `404`.

#### `POST /api/v1/rooms`

- Auth: Bearer JWT.
- Role: `ADMIN`.
- Success: `201`.
- Body:

```json
{
  "name": "Room 1",
  "cinemaId": "clx-cinema-id"
}
```

- `Room(cinemaId, name)` phải unique.

#### `PATCH /api/v1/rooms/:id`

- Auth: Bearer JWT.
- Role: `ADMIN`.
- Success: `200`.
- Body:

```json
{
  "name": "Room 1 IMAX"
}
```

#### `DELETE /api/v1/rooms/:id`

- Auth: Bearer JWT.
- Role: `ADMIN`.
- Success: `200` nếu không còn showtime phụ thuộc.

### 8.9. Seats API

#### `GET /api/v1/seats/room/:roomId`

- Auth: public.
- Success: `200`.
- Trả seats sort theo `row`, `number`.

#### `POST /api/v1/seats/:roomId`

- Auth: Bearer JWT.
- Role: `ADMIN`.
- Success: `201`.
- Body:

```json
{
  "row": "A",
  "number": 1,
  "type": "STANDARD"
}
```

- `type`: optional `STANDARD | VIP | COUPLE`, default `STANDARD`.
- `row`: trim và uppercase trước khi lưu.
- `number`: integer 1-100.
- `COUPLE` phải được cấu hình theo cặp bằng bulk layout; không tạo một ghế Couple đơn lẻ.
- Phòng có showtime không cho thay đổi ghế.
- Unique: `(roomId, row, number)`.

#### `PATCH /api/v1/seats/:id`

- Auth: Bearer JWT.
- Role: `ADMIN`.
- Success: `200`.
- Chỉ cập nhật `type`; ghế Couple phải luôn giữ nguyên cặp:

```json
{
  "type": "VIP"
}
```

#### `DELETE /api/v1/seats/:id`

- Auth: Bearer JWT.
- Role: `ADMIN`.
- Success: `200` nếu seat chưa bị showtime sử dụng.

#### `PUT /api/v1/seats/room/:roomId/layout`

- Auth: Bearer JWT.
- Role: `ADMIN`.
- Thay thế toàn bộ layout khi phòng chưa có showtime.
- Layout yêu cầu ít nhất 5 hàng: 3 hàng đầu `STANDARD`, hàng giữa `VIP`, hàng cuối `COUPLE`.
- Số ghế trong hàng phải liên tục từ 1; hàng Couple phải có số ghế chẵn.

### 8.10. Showtimes API

#### `GET /api/v1/showtimes`

- Auth: public.
- Chỉ trả showtime tương lai của movie `PUBLISHED`.
- Nếu truyền `provinceCode`, chỉ trả suất chiếu thuộc cinema trong tỉnh/thành đó.
- Query:

| Param      | Required | Ví dụ                      | Mô tả                   |
| ---------- | -------- | -------------------------- | ----------------------- |
| `movieId`  | Không    | `clx-movie-id`             | Lọc theo movie          |
| `cinemaId` | Không    | `clx-cinema-id`            | Lọc theo cinema         |
| `format` | Không | `THREE_D_SUBTITLED` | Lọc định dạng suất |
| `roomFormat` | Không | `IMAX` | Lọc công nghệ phòng |
| `specialOnly` | Không | `true` | Phòng khác Standard hoặc suất 3D |
| `provinceCode` | Không | `79` | Lọc theo tỉnh/thành của cinema |
| `from`     | Không    | `2026-10-01T00:00:00.000Z` | Mốc bắt đầu             |
| `to`       | Không    | `2026-10-02T00:00:00.000Z` | Mốc kết thúc            |
| `page`     | Không    | `1`                        | Default `1`             |
| `pageSize` | Không    | `20`                       | Default `20`, max `100` |

- Success: `200`, response `{data, meta}`; mỗi showtime có `format`, `basePrice` và room có `format`.
- Nếu `to <= from`: `400`.

#### `GET /api/v1/showtimes/:id`

- Auth: public.
- Success: `200`.
- Trả showtime, movie, room, cinema và showtime seats.
- Không tìm thấy hoặc movie không published: `404`.

#### `GET /api/v1/showtimes/:id/seats`

- Auth: public.
- Success: `200`.
- Dùng để dựng seat map:

```json
{
  "showtimeId": "clx-showtime-id",
  "startsAt": "2026-10-01T19:00:00.000Z",
  "endsAt": "2026-10-01T21:49:00.000Z",
  "seats": [
    {
      "id": "clx-showtime-seat-id",
      "price": "100000.00",
      "status": "AVAILABLE",
      "heldUntil": null,
      "showtimeId": "clx-showtime-id",
      "seatId": "clx-seat-id",
      "heldByBookingId": null,
      "seat": {
        "id": "clx-seat-id",
        "row": "A",
        "number": 1,
        "type": "STANDARD",
        "roomId": "clx-room-id"
      }
    }
  ]
}
```

#### `POST /api/v1/showtimes`

- Auth: Bearer JWT.
- `startsAt` phải có timezone rõ ràng, frontend gửi giờ Việt Nam dạng `+07:00`.
- `endsAt` không nhận từ client; backend tự tính `startsAt + Movie.duration`.
- Chỉ movie `PUBLISHED` mới được lập lịch.
- Giờ vận hành rạp: suất chiếu chỉ được **bắt đầu từ 08:00 đến 23:00 hằng ngày (giờ Việt Nam)**; vi phạm trả `409 SHOWTIME_OUTSIDE_HOURS`. Suất bắt đầu đúng 23:00 được chấp nhận, phim được phép chiếu lố qua nửa đêm.
- `basePrice`, `vipMultiplier` và `coupleMultiplier` là override tùy chọn. Khi bỏ trống, backend dùng centralized pricing policy theo `Room.format`, `Showtime.format` và ngày địa phương Việt Nam; pricing snapshot được lưu vào `Showtime` và `ShowtimeSeat`. Admin mặc định dùng policy; chỉ gửi override khi bật rõ chế độ ghi đè.

#### `POST /api/v1/showtimes/pricing/quote`

- Auth: Bearer JWT, role `ADMIN`.
- Nhận `roomFormat`, `showtimeFormat`, `startsAt` và các override pricing tùy chọn; không ghi dữ liệu.
- Cuối tuần được định nghĩa là **thứ Sáu–Chủ nhật** theo `Asia/Ho_Chi_Minh`.
- Giá policy chuẩn (Standard / IMAX / ScreenX / 4DX; ngày thường / cuối tuần):
  - 2D: `110.000 / 130.000`; `155.000 / 185.000`; `145.000 / 175.000`; `155.000 / 185.000`.
  - 3D: `145.000 / 185.000`; `190.000 / 240.000`; `180.000 / 230.000`; `190.000 / 240.000`.
- Mặc định `VIP = 1.10`, ghế đôi = `1.20` sau multiplier VIP. Response trả giá Standard/VIP/Couple và cờ cho biết trường nào đã override.

#### `GET /api/v1/showtimes/rooms/:roomId/free-slots`

- Auth: Bearer JWT, role `ADMIN`.
- Query: `date=YYYY-MM-DD` (ngày giờ Việt Nam), `durationMinutes`, `turnaroundMinutes` (default `20`).
- Trả các khung giờ trống có giờ bắt đầu trong `[08:00 → 23:00]` sau khi trừ suất đã chiếm và turnaround hai đầu, kèm danh sách suất bận để đối chiếu. Phim được phép kết thúc sau 23:00; chỉ giữ khe đủ `durationMinutes`.
- Dùng trong form lập lịch để chọn giờ bắt đầu còn trống.

#### `POST /api/v1/showtimes/bulk/preview`

- Auth: Bearer JWT, role `ADMIN`.
- Nhận movie, room, `firstStartsAt`, `count`, `turnaroundMinutes` và pricing.
- Trả danh sách slot, thời gian kết thúc tự tính, `available`, `reasonCode` (`SHOWTIME_OVERLAP` hoặc `SHOWTIME_OUTSIDE_HOURS`) và danh sách `conflicts` (giờ các suất đang chiếm) cho slot bị trùng.
- Không ghi dữ liệu.

#### `POST /api/v1/showtimes/bulk`

- Auth: Bearer JWT, role `ADMIN`.
- Tạo toàn bộ slot trong một transaction Serializable.
- Nếu có overlap hoặc lỗi khởi tạo seat, rollback toàn batch.
- Database exclusion constraint vẫn là lớp bảo vệ cuối cùng.
- Role: `ADMIN`.
- Success: `201`.
- Body:

```json
{
  "movieId": "clx-movie-id",
  "roomId": "clx-room-id",
  "firstStartsAt": "2026-10-01T19:00:00+07:00",
  "format": "TWO_D_SUBTITLED",
  "count": 5,
  "turnaroundMinutes": 20
}
```

Rules:

- Movie phải tồn tại và `PUBLISHED`.
- Room phải tồn tại và có layout hợp lệ với ít nhất 5 hàng.
- `endsAt = startsAt + Movie.duration`.
- `startsAt` phải có timezone và ở tương lai.
- `startsAt` (giờ Việt Nam) phải trong khoảng 08:00–23:00 cùng ngày.
- Không overlap với showtime khác trong cùng room.
- Standard price = `basePrice`.
- VIP price = `basePrice * vipMultiplier`; default multiplier `1.1`.
- Couple price trên mỗi ghế = `basePrice * vipMultiplier * coupleMultiplier`; default multiplier `1.2`.
- Một cặp Couple gồm 2 `ShowtimeSeat`, giá cả cặp với ví dụ trên là `264000.00`.
- Tạo một `ShowtimeSeat` cho mỗi seat của room.

#### `GET /api/v1/showtimes/cinemas/:cinemaId/free-slots`

- Auth: Bearer JWT, role `ADMIN`.
- Query: `date=YYYY-MM-DD`, `durationMinutes` và `turnaroundMinutes`.
- Khung giờ xét giờ bắt đầu từ `08:00` đến `23:00`; thời lượng phim có thể kết thúc sau `23:00` hoặc qua nửa đêm.
- Mỗi room trả một lịch khung giờ tối đa có thể xếp đồng thời; các slot trong cùng room không overlap và đã giữ đủ turnaround.
- `schedulableCount` là tổng sức chứa thực tế của tất cả room hợp lệ, không giới hạn hai suất mỗi room. Room không có layout hợp lệ có sức chứa bằng `0`.

#### `POST /api/v1/showtimes/cinema-bulk/preview`

- Auth: Bearer JWT, role `ADMIN`.
- Nhận `movieId`, `cinemaId`, `date`, `count`, `format`, `turnaroundMinutes` và pricing override tùy chọn.
- Không còn dùng seed random để quyết định thứ tự. Planner tạo lịch xác định, phân bổ vòng tròn giữa các room rồi trả assignments theo `startsAt` tăng dần.
- `schedulableCount` là tổng capacity; `assignments.length` là số suất sẽ tạo (`count` nếu đủ capacity).
- Mỗi assignment trả room format, loại ngày và giá Standard/VIP/Couple hiệu lực. Khi không gửi override, giá được tính riêng theo format của từng room.
- Không ghi dữ liệu.

#### `POST /api/v1/showtimes/cinema-bulk`

- Auth: Bearer JWT, role `ADMIN`.
- Rebuild plan trong transaction `Serializable`, tạo showtime và snapshot `ShowtimeSeat` cho từng assignment.
- Nếu capacity không đủ, trả `409 SHOWTIME_BULK_SHORTAGE` và rollback toàn bộ.
- Preview và commit dùng cùng planner; nếu availability thay đổi giữa hai request, commit tính lại trên snapshot mới thay vì tin preview cũ.

#### `DELETE /api/v1/showtimes/:id`

- Auth: Bearer JWT.
- Role: `ADMIN`.
- Success: `200` nếu chưa có booking.
- Nếu đã có booking: `409`.

### 8.11. Bookings API

Tất cả route booking yêu cầu Bearer JWT và chỉ đọc/thay đổi booking của user hiện tại.

#### `POST /api/v1/bookings/hold`

- Auth: Bearer JWT.
- Success: `201`.
- Header khuyến nghị:

```http
Idempotency-Key: hold-request-001
```

- Body:

```json
{
  "showtimeId": "clx-showtime-id",
  "showtimeSeatIds": ["clx-showtime-seat-a1", "clx-showtime-seat-a2"]
}
```

Validation:

- `showtimeId`: non-empty string.
- `showtimeSeatIds`: array, tối thiểu 1, tối đa 10.
- Các seat ID phải unique.

State effect:

1. Verify showtime published/chưa bắt đầu và còn hơn 5 phút.
2. Tính thời gian hold: 10 phút khi suất còn hơn 15 phút; 2 phút khi suất còn từ 5 đến 15 phút.
3. Nếu suất còn tối đa 5 phút, request hold trả `409 SHOWTIME_TOO_CLOSE`.
4. Verify seat IDs thuộc đúng showtime.
4. Sinh `holdToken` nội bộ.
5. Redis `SET NX EX 600` cho từng ghế.
5. Transaction kiểm tra ghế `AVAILABLE`.
6. Tính tổng tiền từ `ShowtimeSeat.price`.
7. Tạo `Booking(PENDING)` và `BookingItem`.
8. Chuyển ghế thành `HELD`, set `heldUntil`, `heldByBookingId`.
9. Release Redis lock nếu transaction rollback.

Idempotency:

- Key tối đa 100 ký tự.
- Cùng user + cùng key + cùng payload trả booking cũ.
- Cùng key nhưng payload khác trả `409`.
- Không truyền key vẫn hold được nhưng không có retry canonical bằng database.

Response public hiện loại root `holdToken`, nhưng nested response có thể còn các field state nội bộ của `ShowtimeSeat`.

Errors: `400`, `401`, `404`, `409`, `503`.

#### `GET /api/v1/bookings`

- Auth: Bearer JWT.
- Success: `200`.
- Trả array booking của user hiện tại, sort `createdAt desc`.
- Chưa có pagination.

#### `GET /api/v1/bookings/:id`

- Auth: Bearer JWT.
- Success: `200`.
- Chỉ trả booking nếu thuộc user hiện tại.
- Không tồn tại/không thuộc user: `404`.
- Có thể expire booking mục tiêu trước khi trả kết quả.

#### `POST /api/v1/payments/bookings/:bookingId/checkout`

- Auth: Bearer JWT.
- Success: `201`.
- Không cần body.
- Kiểm tra booking còn `PENDING`, chưa hết hạn và còn sở hữu toàn bộ seat.
- Tạo hoặc reuse `SepayPaymentIntent` đang `PENDING`, kèm payment code và QR VietQR.
- Trả thông tin ngân hàng, số tiền, mã thanh toán, QR URL và thời gian hết hạn.

#### `POST /api/v1/bookings/:id/cancel`

- Auth: Bearer JWT.
- Success: `201`.
- `PENDING` chuyển thành `CANCELLED`; retry trên `CANCELLED` hoặc `EXPIRED` trả trạng thái hiện tại.
- `CONFIRMED` không thể cancel và trả `409`.
- State effect:
  - Booking → `CANCELLED`.
  - Payment pending → `FAILED`.
  - Seat hold → `AVAILABLE`.
  - Release Redis lock.
- Errors: `401`, `404`, `409`.
- Frontend trang thanh toán: khi booking còn `PENDING`, nút Back trình duyệt, link rời trang và đóng tab đều hỏi xác nhận rồi tự gọi cancel để nhả ghế; khi `CONFIRMED`, frontend invalidate danh sách vé và chuyển tới `/tickets` để hiển thị toàn bộ vé của booking, không chỉ vé đầu tiên.

### 8.12. Payments API

#### `POST /api/v1/payments/bookings/:bookingId/checkout`

- Auth: Bearer JWT.
- Success: `201`.
- Tạo hoặc trả lại `SepayPaymentIntent` cho booking đang `PENDING`.
- Không gia hạn booking: `expiresAt` của intent đồng bộ với booking.
- Trả thông tin ngân hàng, mã chuyển khoản unique (`CB...`), số tiền và URL QR VietQR (`template=compact`).
- Lỗi: `401`, `404`, `409` (`BOOKING_NOT_PAYABLE`, `SHOWTIME_TOO_CLOSE`, `BOOKING_SEATS_NOT_OWNED`).

Response:

```json
{
  "intentId": "clx-intent-id",
  "paymentCode": "CBA1B2C3",
  "amount": "200000",
  "bankCode": "MB",
  "accountNumber": "0123456789",
  "accountName": "CINEBOOK",
  "qrUrl": "https://vietqr.app/img?acc=0123456789&bank=MB&amount=200000&des=CBA1B2C3&template=compact",
  "expiresAt": "2026-09-21T14:10:00.000Z",
  "status": "PENDING"
}
```

#### `POST /api/v1/payments/sepay/webhook`

- Auth: SePay API Key qua header `Authorization: Apikey <KEY>`.
- Success: `201` với body `{ "success": true }`.
- Validation lenient riêng cho webhook (không dùng `forbidNonWhitelisted` toàn cục): field lạ từ SePay (ví dụ `code`) được bỏ qua, chỉ reject khi thiếu/sai field bắt buộc (`id`, `gateway`, `transactionDate`, `accountNumber`, `transferType`, `transferAmount`).
- Bỏ qua giao dịch `transferType !== 'in'` và giao dịch trùng theo `id` SePay.
- Khớp mã thanh toán `CB...` trong nội dung và số tiền.
- Nếu hợp lệ: chuyển booking sang `CONFIRMED`, ghế sang `SOLD`, tạo ticket và giải phóng Redis lock.
- Nếu không khớp mã, sai số tiền hoặc booking đã hết hạn: ghi nhận `SepayTransaction` với trạng thái `REVIEW_REQUIRED` để Admin đối soát và hoàn tiền thủ công; không tự động cấp vé.

#### `GET /api/v1/payments/admin/sepay/transactions`

- Auth: Bearer JWT (Role `ADMIN`).
- Success: `200`.
- Danh sách 100 giao dịch SePay gần nhất, hỗ trợ lọc theo query `status`.

#### `PATCH /api/v1/payments/admin/sepay/transactions/:id`

- Auth: Bearer JWT (Role `ADMIN`).
- Success: `200`.
- Cập nhật trạng thái giao dịch (ví dụ: chuyển sang `REFUNDED` sau khi hoàn tiền thủ công) kèm `adminNote`.

#### Payment record sau webhook

Khi webhook SePay khớp payment code, số tiền và intent còn hạn:

1. Giao dịch được ghi nhận với trạng thái `MATCHED`, sau đó chuyển `CONFIRMED`.
2. Payment được tạo hoặc cập nhật với `provider: "SEPAY"`, `status: "SUCCEEDED"` và reference `SEPAY-<sepayId>`.
3. Booking chuyển sang `CONFIRMED`, ghế chuyển sang `SOLD`, ticket được upsert và Redis lock được giải phóng.
4. Gửi lại cùng `sepayId` trả thành công idempotently nhờ unique constraint.
5. Tạo một mail outbox `TICKETS_ISSUED` theo booking; Worker Thread render template CineBook, tạo QR inline và gửi một email chứa toàn bộ vé. SMTP lỗi không rollback booking/payment, outbox sẽ retry. Sau khi transaction commit, API đánh thức worker; polling fallback vẫn bảo đảm không bỏ sót.

Giao dịch không khớp mã, sai tiền hoặc đến sau khi intent hết hạn được lưu `REVIEW_REQUIRED`; hệ thống không tự cấp vé.
### 8.13. Tickets API

#### `GET /api/v1/tickets`

- Auth: Bearer JWT.
- Success: `200`.
- Trả ticket thuộc user hiện tại, sort `createdAt desc`.
- Include booking/showtime/movie/cinema/room và booking item/seat.

#### `GET /api/v1/tickets/:id`

- Auth: Bearer JWT.
- Success: `200`.
- Chỉ trả ticket nếu ticket thuộc booking của user hiện tại.
- Không tồn tại/không thuộc user: `404`.

Chưa có:

- Check-in/consume ticket.
- `ACTIVE -> USED`.
- Cancel ticket.
- Refund ticket.
- Admin ticket lookup.

## 9. Các business flow

### 9.1. Customer flow

```text
POST /auth/register hoặc /auth/login
    ↓
GET /movies
    ↓
GET /showtimes?movieId=...
    ↓
GET /showtimes/:id/seats
    ↓
POST /bookings/hold
    ↓
POST /payments/bookings/:bookingId/checkout
    ↓
SePay chuyển khoản + POST /payments/sepay/webhook
    ↓
GET /tickets
```

### 9.2. Admin flow

```text
Seed hoặc login admin
    ↓
GET /movies/admin/tmdb?search=... hoặc GET /movies/admin/tmdb
    ↓
PUT /movies/admin/tmdb/:tmdbId/import
    ↓
Movie nội bộ được tạo với status DRAFT
    ↓
PATCH /movies/:id { status: PUBLISHED }
    ↓
POST /cinemas
    ↓
POST /rooms
    ↓
POST /seats/:roomId
    ↓
POST /showtimes
    ↓
Customer thấy movie qua GET /movies và có thể booking
```

#### 9.2.1. TMDB movie import flow

```mermaid
sequenceDiagram
    autonumber
    participant A as Admin UI
    participant API as NestJS API
    participant T as TMDB API
    participant DB as PostgreSQL

    A->>API: GET /movies/admin/tmdb?search=Dune
    API->>T: GET /3/search/movie hoặc /3/movie/now_playing
    T-->>API: TMDB movie list
    API->>DB: Kiểm tra Movie.tmdbId trong kết quả
    DB-->>API: imported/importedMovieId markers
    API-->>A: Chuẩn hóa { data, meta }

    A->>API: PUT /movies/admin/tmdb/:tmdbId/import
    API->>DB: Tìm Movie.tmdbId
    alt Đã import
        DB-->>API: Movie hiện tại
        API-->>A: imported=false
    else Chưa import
        API->>T: GET /3/movie/:tmdbId?language=vi-VN
        alt Không có trailer phù hợp
            API->>T: GET /3/movie/:tmdbId?language=en-US (video fallback)
        end
        T-->>API: Movie detail/runtime/media
        API->>DB: Tạo Movie với status DRAFT
        DB-->>API: Movie nội bộ
        API-->>A: imported=true
    end

    A->>API: PUT /movies/admin/tmdb/:tmdbId/resync
    API->>DB: Tìm Movie.tmdbId
    API->>T: Lấy media/trailer mới
    API->>DB: Chỉ cập nhật poster/backdrop/trailer có giá trị
    DB-->>API: Movie giữ nguyên trường biên tập
    API-->>A: MovieResponseDto

    A->>API: PATCH /movies/:id với status=PUBLISHED
    A->>API: POST /showtimes
    API-->>A: Movie sẵn sàng cho customer booking
```

Quy tắc của flow:

- Chỉ Admin có JWT hợp lệ mới được gọi ba endpoint TMDB.
- API key/token TMDB chỉ được backend sử dụng; frontend không gọi TMDB trực tiếp.
- Search/list TMDB không ghi database.
- Import lấy detail TMDB để lấy `runtime`; duration thiếu thì dùng `120` phút.
- Import không tự publish và không tự tạo cinema, room, seat hoặc showtime.
- Modal Admin hỗ trợ phân trang tối đa 20 trang, chọn xuyên trang tối đa 20 phim, queue concurrency 3, partial success và retry riêng item lỗi; modal không đóng sau import.
- `Movie.tmdbId` unique giúp thao tác import lặp lại an toàn.
- Resync chỉ cập nhật media/trailer có giá trị mới và không xóa media hiện tại khi TMDB thiếu dữ liệu.
- Public `GET /movies` và `GET /movies/:id` chỉ dùng movie nội bộ `PUBLISHED`.
- Không được dùng trực tiếp TMDB ID làm `movieId` trong showtime hoặc booking.


### 9.3. Booking sequence

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant API as NestJS API
    participant R as Redis
    participant DB as PostgreSQL

    C->>API: POST /bookings/hold\nIdempotency-Key
    API->>R: SET NX seat lock\nTTL 600 seconds
    R-->>API: Lock acquired
    API->>DB: Transaction: check AVAILABLE seats
    DB-->>API: Seats available
    API->>DB: Create Booking PENDING and items
    API->>DB: Mark seats HELD
    DB-->>API: Booking expiresAt
    API-->>C: Booking PENDING

    C->>API: POST /payments/bookings/:bookingId/checkout
    API->>DB: Verify booking and held seats
    API->>DB: Create or reuse SepayPaymentIntent
    API-->>C: Payment code + VietQR URL

    C->>Bank: Chuyển khoản theo payment code
    Bank->>API: POST /payments/sepay/webhook
    API->>DB: Unique sepayId + đối soát mã và số tiền
    alt Matched and not expired
        API->>DB: Payment SEPAY SUCCEEDED
        API->>DB: Booking CONFIRMED
        API->>DB: Seats SOLD
        API->>DB: Upsert tickets
        API->>R: Release owned locks
        API-->>Bank: success=true
    else Review required
        API->>DB: SepayTransaction REVIEW_REQUIRED
        API-->>Bank: success=true
    end
```

### 9.4. Booking expiration

```mermaid
sequenceDiagram
    autonumber
    participant S as Scheduler
    participant B as Booking Service
    participant DB as PostgreSQL
    participant R as Redis

    S->>B: Run every minute
    B->>DB: Find PENDING bookings where expiresAt <= now
    DB-->>B: Expired bookings
    loop Each booking
        B->>DB: Transaction: Booking EXPIRED
        B->>DB: Payment PENDING -> FAILED
        B->>DB: Seats HELD -> AVAILABLE
        B->>R: Release owned locks
    end
```

## 10. Concurrency và idempotency

### 10.1. Redis lock

Key format:

```text
booking:seat:<showtimeId>:<showtimeSeatId>
```

Khi hold:

```text
SET key <holdToken> EX 600 NX
```

- `NX`: chỉ request đầu tiên lấy được lock.
- `EX 600`: lock tự hết hạn sau 10 phút.
- Lua compare-and-delete: chỉ owner có đúng `holdToken` mới được release.

### 10.2. PostgreSQL state

Redis chỉ là lớp lock phân tán. PostgreSQL là nguồn trạng thái cuối cùng:

- `ShowtimeSeat.status` xác định seat available/held/sold.
- `heldByBookingId` xác định booking owner.
- `heldUntil` xác định thời điểm hết hold.
- Transaction cập nhật booking và seat cùng nhau.

### 10.3. Hold idempotency

`Booking` lưu:

- `idempotencyKey`.
- `requestHash` của `showtimeId` và sorted seat IDs.

Quy tắc:

- Same key, same payload: trả booking hiện có.
- Same key, different payload: `409 Conflict`.
- Không key: vẫn có Redis/database protection cho seat, nhưng retry không có response canonical.

### 10.4. SePay webhook idempotency

`SepayTransaction.sepayId` là unique. Nếu SePay gửi lại cùng giao dịch, API trả `{ "success": true }` mà không tạo thêm transaction, payment hoặc ticket.

Khi hai webhook cùng giao dịch đến đồng thời, unique constraint trên `sepayId` bảo vệ việc ghi nhận một transaction duy nhất; transaction thắng sẽ tiếp tục confirm booking trong cùng flow.

Ticket dùng `bookingItemId` unique và được upsert; một booking không thể phát hành duplicate ticket.

### 10.5. Các invariant database

Migration thêm:

- `Showtime.startsAt < Showtime.endsAt`.
- Không overlap showtime trong cùng room.
- Price/amount không âm.
- `HELD` phải có đủ hold fields.
- Status khác `HELD` không được có hold fields.
- Composite unique booking item.

## 11. Scheduler và lifecycle

### 11.1. Booking expiry scheduler

File: `be/src/modules/bookings/booking-expiry.scheduler.ts`.

- Cron: mỗi phút.
- Gọi `BookingsService.expireBookings()`.
- Tìm booking `PENDING` hết hạn.
- Chuyển booking thành `EXPIRED`.
- Chuyển payment pending thành `FAILED` nếu còn dữ liệu legacy.
- Chuyển SePay intent pending thành `EXPIRED`.
- Release seat và Redis lock.

### 11.2. Request-driven expiry

Một số request có thể gọi expiry cho booking mục tiêu trước khi đọc/thao tác:

- Lấy booking detail.
- Cancel.
- Checkout SePay.
- Đọc showtime/seat map: `ShowtimesService` ủy quyền cleanup cho `BookingsService` theo showtime.

`ShowtimesService` không tự đổi `ShowtimeSeat` nữa; expiry trung tâm đồng bộ booking, payment, DB seat và Redis lock. Scheduler vẫn là cơ chế chính để cleanup toàn hệ thống.

### 11.3. Redis lifecycle

`RedisService`:

- Connect tại module init.
- `ping()` dùng cho readiness.
- `setIfAbsent()` tạo lock.
- `releaseIfOwned()` release an toàn.
- Disconnect tại module destroy.

## 12. Validation và error handling

### 12.1. Global ValidationPipe

```text
transform: true
whitelist: true
forbidNonWhitelisted: true
```

Tác dụng:

- Query `page`/`pageSize` được transform sang number.
- Field không nằm trong DTO bị từ chối.
- Body/query sai type bị trả `400`.

### 12.2. HTTP status

| Status | Ý nghĩa                                                                 |
| -----: | ----------------------------------------------------------------------- |
|  `200` | GET/PATCH/DELETE hoặc action khai báo OK                                |
|  `201` | POST mặc định của NestJS                                                |
|  `204` | Logout thành công, không body                                           |
|  `400` | Validation hoặc business input sai                                      |
|  `401` | Thiếu/sai/expired JWT hoặc refresh token                                |
|  `403` | Không đủ role hoặc quyền truy cập                                      |
|  `404` | Resource không tồn tại hoặc không thuộc user                            |
|  `409` | Duplicate, seat conflict, overlap, state conflict, idempotency conflict |
|  `502` | TMDB upstream hoặc kết nối TMDB thất bại                              |
|  `503` | Database/Redis readiness không sẵn sàng, TMDB chưa cấu hình hoặc rate limit |
|  `504` | TMDB upstream timeout                                                   |

### 12.3. Error response

Backend dùng `ApiExceptionFilter` để chuẩn hóa lỗi HTTP và lỗi Prisma. `code` là mã ổn định cho frontend dịch thông báo; `message` vẫn giữ nội dung chẩn đoán tương thích:

```json
{
  "statusCode": 409,
  "code": "SEATS_HELD",
  "message": "One or more seats are being held",
  "details": [],
  "path": "/api/v1/bookings/hold",
  "requestId": "req_123",
  "timestamp": "2026-09-07T10:00:00.000Z"
}
```

Một số domain code thường dùng gồm `MOVIE_NOT_PUBLISHED`, `SHOWTIME_OVERLAP`, `SHOWTIME_OUTSIDE_HOURS`, `ROOM_LAYOUT_INVALID`, `SEATS_UNAVAILABLE`, `BOOKING_NOT_PAYABLE`, `TMDB_NOT_CONFIGURED` và `TMDB_RATE_LIMITED`.

Validation error:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_FAILED",
  "message": "Request validation failed",
  "details": ["email must be an email"],
  "path": "/api/v1/auth/register",
  "requestId": "req_123",
  "timestamp": "2026-09-07T10:00:00.000Z"
}
```

Filter cũng trả header `X-Request-Id`. Các Prisma error chính được map như sau:

| Prisma error | HTTP | Code |
|---|---:|---|
| `P2002` | `409` | `DATABASE_CONFLICT` |
| `P2003` | `409` | `FOREIGN_KEY_CONFLICT` |
| `P2025` | `404` | `RESOURCE_NOT_FOUND` |

## 13. Testing

### 13.1. Test scripts

Các lệnh từ repository root:

```bash
npm run api:generate
npm run api:check
npm test
npm run test:e2e
npm run test:integration
npm run test:cov
npm run typecheck
npm run lint
npm run build
npm run check
npm run check:ci
```

- `npm run api:generate` export OpenAPI và sinh frontend declarations.
- `npm run api:check` kiểm tra generated artifacts có deterministic và up to date.
- `npm run check` chạy lint, typecheck, build, unit test và E2E test cho backend/frontend.
- `npm run test:integration` dùng PostgreSQL/Redis test riêng, deploy migrations và tự teardown containers.
- `npm run check:ci` thêm API drift check và integration suite.

Generated API artifacts:

```text
openapi/ticket-booking.openapi.json
fe/src/generated/openapi.d.ts
```

Backend controller/DTO là nguồn contract. Không chỉnh tay generated files; chạy `npm run api:generate` sau khi thay đổi API. `npm run api:check` export vào thư mục tạm và so sánh byte-for-byte để phát hiện drift mà không cần Git tracking hoặc infrastructure.

### 13.2. Test hiện có

Unit test:

- Password hash/verify và malformed hash.
- JWT access/refresh create/verify.
- JWT reject khác secret.
- Booking expiry scheduler delegate.
- Root controller.

E2E test:

- Root route dưới `/api/v1`.
- Health liveness.
- Auth payload validation.
- OpenAPI response contracts cho pagination, seat map, SePay checkout/webhook và error schema.

Integration test với PostgreSQL/Redis thật:

- Readiness database/Redis.
- Hai user giữ cùng seat đồng thời.
- Retry cùng hold idempotency key, bao gồm concurrent retry.
- Cùng idempotency key nhưng payload khác.
- Booking expiry giải phóng seat và cho user khác hold lại.
- Cancel retry trả kết quả canonical và giải phóng seat/Redis lock.
- Checkout SePay tạo intent và payment code trên booking đang giữ ghế.
- Webhook SePay đúng mã/số tiền chuyển booking thành công và phát hành ticket.
- Webhook SePay lặp hoặc concurrent không tạo transaction/payment/ticket trùng.
- Webhook sai tiền vào `REVIEW_REQUIRED` và không cấp vé.
- Booking expiry/cancel giải phóng seat và cập nhật intent.
- TMDB response normalization và đánh dấu movie đã import.
- TMDB import lặp lại không tạo movie duplicate.
- TMDB detail ưu tiên video tiếng Việt, fallback video tiếng Anh khi thiếu candidate phù hợp.
- TMDB resync chỉ cập nhật media/trailer có giá trị và giữ nguyên trường biên tập.

Frontend test:

- `npm run test:fe` chạy Vitest cho bounded queue concurrency 3, partial failure, giới hạn 20 và patch toàn bộ cache `tmdb-movies`.

Test chưa có trong Sprint 1:

- Hai showtime overlap cùng room.
- Migration backfill trên dữ liệu cũ.
- Refresh token rotation concurrent.

## 14. Cách chạy project

Tất cả lệnh trong phần này chạy từ repository root `ticket-booking/`.

### 14.1. Setup lần đầu

Linux/macOS/Git Bash:

```bash
cp be/.env.example be/.env
cp fe/.env.example fe/.env
npm install
npm run install:all
npm run infra:up
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
```

PowerShell:

```powershell
Copy-Item be/.env.example be/.env
Copy-Item fe/.env.example fe/.env
npm install
npm run install:all
npm run infra:up
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
```

Root `package.json` điều phối commands nhưng không gộp dependency: `be/package-lock.json` và `fe/package-lock.json` vẫn là lockfile độc lập.

### 14.2. Root scripts

| Lệnh | Tác dụng |
| --- | --- |
| `npm run dev` | Chạy backend watch và frontend Vite song song |
| `npm run dev:be` | Chỉ chạy backend watch |
| `npm run dev:fe` | Chỉ chạy frontend Vite |
| `npm run dev:all` | Bật PostgreSQL/Redis rồi chạy cả hai app |
| `npm run build` | Build backend và frontend |
| `npm run lint` | Lint backend và frontend |
| `npm run typecheck` | Typecheck backend và frontend |
| `npm run check` | Lint, typecheck, build, unit test và E2E test |
| `npm run check:ci` | API drift check, static checks và integration test |
| `npm run api:generate` | Export OpenAPI và sinh frontend types |
| `npm run api:check` | Kiểm tra generated API artifacts deterministic |
| `npm run test:integration` | Chạy integration test với PostgreSQL/Redis test riêng |
| `npm run infra:up` | Start PostgreSQL và Redis |
| `npm run infra:down` | Stop PostgreSQL và Redis |
| `npm run prisma:generate` | Generate Prisma Client |
| `npm run prisma:deploy` | Apply migrations |
| `npm run prisma:seed` | Seed catalog/admin data |
| `npm run prisma:studio` | Mở Prisma Studio |


Nếu muốn cài dependency sau clone, chạy `npm install` ở root và `npm run install:all`.

### 14.3. Runtime URL và cấu hình frontend

Backend:

```text
API root: http://localhost:3000/api/v1
Swagger:  http://localhost:3000/api/docs
```

Frontend Vite mặc định chạy tại URL được Vite chọn, thường là `http://localhost:5173`. API URL mặc định:

```text
http://localhost:3000/api/v1
```

Có thể đổi bằng `fe/.env`:

```env
VITE_API_URL=http://localhost:3000/api/v1
```

Kiểm tra nhanh:

```bash
curl http://localhost:3000/api/v1/health
curl http://localhost:3000/api/v1/movies
```

Các màn hình MVP:

- Login/register.
- Movie catalog và search.
- Showtime selection.
- Seat map với `AVAILABLE`, `HELD`, `SOLD`.
- Hold ghế và countdown expiry.
- Checkout SePay bằng mã QR/chuyển khoản và trạng thái booking sau webhook.
- Booking history.
- Ticket history.

### 14.4. Manual flow mẫu

1. Copy `be/.env.example` thành `be/.env`.
2. Đặt TMDB API Read Access Token vào `TMDB_ACCESS_TOKEN` trong `be/.env`; không đặt token ở `fe/.env`.
3. Seed admin.
4. Login admin qua `/api/v1/auth/login`.
5. Dùng `Authorize` trên Swagger với access token.
6. Gọi `GET /api/v1/movies/admin/tmdb` hoặc mở Admin > Phim > Nhập từ TMDB.
7. Tìm phim bằng `search` hoặc xem danh sách now playing.
8. Gọi `PUT /api/v1/movies/admin/tmdb/:tmdbId/import` cho phim được chọn.
9. Kiểm tra phim trong `GET /api/v1/movies/admin`; phim mới có trạng thái `DRAFT`.
10. Dùng `PATCH /api/v1/movies/:id` để chuyển phim sang `PUBLISHED` sau khi kiểm tra.
11. Tạo cinema, room, seats, showtime cho movie nội bộ bằng `id`.
12. Register/login customer.
13. Lấy showtime seats; chọn một ghế Couple sẽ chọn cả cặp.
14. Hold một hoặc nhiều ghế; backend canonicalize cặp Couple và giới hạn 10 ghế vật lý.
15. Checkout booking để lấy mã thanh toán và QR.
16. Chuyển khoản theo đúng số tiền/nội dung payment code.
17. Chờ webhook SePay xác nhận rồi lấy ticket.

### 14.5. Dữ liệu cinema seed tĩnh

`be/prisma/data/cinemas.seed.json` là file dữ liệu tĩnh được chuẩn bị một lần từ nguồn dữ liệu bản đồ đã rà soát. File chỉ chứa dữ liệu nghiệp vụ cần phục hồi:

- `id`, `name`, `address`, `provinceCode` của cinema.
- `id`, `name` và tùy chọn layout của room.
- Layout ghế được `be/prisma/seed.ts` sinh bằng `buildSeatLayout()`.

Khi reset database, chạy migration rồi chạy `npm run prisma:seed`. Seed không gọi mạng và không phụ thuộc OSM runtime. Nếu phân phối dữ liệu bản đồ gốc hoặc phái sinh, cần giữ attribution và tuân thủ ODbL.

## 15. Known limitations và roadmap

### 15.1. Limitations hiện tại

- Email phụ thuộc SMTP provider được cấu hình qua `SMTP_*`; cần kiểm tra credentials và network access trước khi chạy Worker Thread. Worker dùng at-least-once delivery, dedupe theo outbox và có thể gửi lại nếu process crash sau SMTP thành công nhưng trước khi ghi `SENT`.
- Chưa có webhook signature verification.
- Chưa có refund flow dù enum `REFUNDED` đã tồn tại.
- Chưa có ticket check-in/consume; đây là chủ ý ngoài scope roadmap hiện tại, QR chỉ dùng để khách xuất trình tại rạp.
- Chưa có admin user management.
- TMDB search/import hiện do Admin chủ động; chưa có scheduler tự động đồng bộ phim từ TMDB.
- Province context mặc định mã `79` (Thành phố Hồ Chí Minh), được lưu ở frontend localStorage key `ticket_booking_province_code`.
- Trailer chỉ lưu YouTube key; customer phát bằng `youtube-nocookie.com` trong modal, không nhận iframe tùy ý.
- Booking list chưa pagination.
- Response DTO và public response mapper đã được chuẩn hóa cho API contract hiện tại.
- OpenAPI JSON và frontend declarations được sinh từ backend contract qua root scripts.
- Custom error format đã được thêm với `code`, `details`, `path`, `requestId` và `timestamp`.
- Integration/concurrency suite đã có cho hold, idempotency, expiry và payment; các case migration backfill/showtime overlap/refresh rotation vẫn chưa có.
- Chưa có Dockerfile cho API.
- Chưa có CI/CD.
- Chưa có rate limiting, Helmet, structured logging và tracing.
- `prisma:seed` cập nhật admin role/name nhưng không đổi password nếu admin đã tồn tại.

### 15.2. Roadmap đề xuất

Roadmap chi tiết được lưu trong [`WORKLOG.md`](./WORKLOG.md). Mục tiêu là học sâu các năng lực cần cho production nhưng giữ kiến trúc monolith vừa đủ cho personal project.

1. **Baseline và release contract:** đồng bộ tài liệu, production checklist, smoke test customer flow thật và browser verification.
2. **Frontend architecture và component extraction:** tách page monolith theo feature, shared components, hooks và state boundaries; giữ nguyên route/API/query key/behavior, plain CSS và design system.
3. **Security/correctness hardening:** Redis rate limiting, CORS allowlist, Helmet/security headers, production Swagger gate, webhook hardening, refresh-token reuse detection, cleanup jobs và concurrency tests.
4. **Container/CI/CD/observability:** Dockerfile, staging, CI quality gate, structured logs, request ID, metrics, alerts, backup/restore và rollback runbook.
5. **Payment reconciliation/refund:** hoàn thiện state transition SePay/payment/booking/ticket, manual reconciliation, refund idempotency và audit trail; chưa cần payment abstraction provider thứ hai.
6. **Pagination/query performance:** chuẩn hóa pagination/filter/sort cho booking, ticket, payment và các list tăng trưởng; kiểm tra index, query plan và load test.
7. **Automated critical journeys:** browser/component/contract tests cho auth, seat hold, checkout, webhook, nhiều ticket, responsive và light/dark.
8. **Account/RBAC/audit:** password reset, session management, admin user management, permission boundaries và audit log.

Ticket check-in/consume không thuộc scope roadmap hiện tại; QR chỉ phục vụ khách xuất trình tại rạp. Promotion, TMDB scheduler, dashboard nâng cao, provider thứ hai và recommendation để backlog sau production baseline.
