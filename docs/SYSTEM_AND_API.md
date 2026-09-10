# Movie Ticket Booking Backend

Tài liệu này mô tả hệ thống hiện tại theo đúng source code, Prisma schema, migration và controller trong repository.

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

Đây là backend đặt vé xem phim được xây dựng theo kiến trúc **modular monolith**. Mỗi domain nằm trong một NestJS module riêng, tất cả cùng chạy trong một ứng dụng Express.

MVP hiện tại hỗ trợ:

- Đăng ký, đăng nhập, refresh token và logout.
- Phân quyền `CUSTOMER` và `ADMIN`.
- CRUD phim, rạp, phòng, ghế và suất chiếu.
- Xem sơ đồ ghế theo suất chiếu.
- Giữ ghế tạm thời bằng Redis.
- Tạo booking và tính tiền ở server.
- Checkout tạo payment pending.
- Mock payment cho development/test.
- Phát hành ticket sau payment thành công.
- Hủy hoặc expire booking và giải phóng ghế.
- Swagger UI để thử API.

### Mục tiêu nhất quán dữ liệu

Một ghế theo một suất chiếu chỉ được bán một lần. Hệ thống phối hợp:

1. Redis lock có TTL để giảm tranh chấp giữa các request.
2. PostgreSQL transaction để cập nhật booking, ghế, payment và ticket.
3. Unique constraint và check constraint để bảo vệ invariant ở database.
4. Idempotency key để retry request không tạo dữ liệu trùng.

## 2. Công nghệ và infrastructure

### 2.1. Application stack

| Thành phần | Phiên bản/công nghệ | Vai trò |
|---|---|---|
| Framework | NestJS 12 | Module, dependency injection, controller, service |
| HTTP adapter | Express (`@nestjs/platform-express`) | Xử lý HTTP |
| Language | TypeScript | Type safety |
| ORM | Prisma 6.19.3 | Schema, migration và Prisma Client |
| Database | PostgreSQL 17 | Lưu dữ liệu và transaction |
| Cache/lock | Redis 7 + ioredis 6 | Lock ghế có TTL |
| Authentication | JWT + `jsonwebtoken` | Access token/refresh token |
| Password | Node `crypto.scrypt` | Hash password |
| Validation | `class-validator`, `class-transformer` | Validate body/query |
| Documentation | `@nestjs/swagger` | OpenAPI/Swagger UI |
| Scheduler | `@nestjs/schedule` | Expire booking mỗi phút |
| Unit/E2E test | Vitest, Supertest | Kiểm thử |

Dependencies được khai báo tại `package.json`.

### 2.2. Docker services

File: `docker-compose.yml`.

| Service | Port | Thông tin |
|---|---:|---|
| PostgreSQL | `5432` | DB `ticket_booking`, user `ticket_booking`, password local `ticket_booking` |
| Redis | `6379` | Seat lock |
| pgAdmin | `5050` | `http://localhost:5050`, email `admin@admin.com`, password `adminpassword` |

Application hiện chạy trực tiếp bằng Node/NestJS; chưa có Dockerfile cho API.

### 2.3. URL API

- Base URL: `http://localhost:3000`
- API prefix: `/api/v1`
- API root: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/api/docs`

Global prefix, CORS, validation pipe và Swagger được cấu hình tại `src/config/app.config.ts`.

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

```text
src/
├── common/
│   ├── auth/
│   │   ├── auth-user.ts
│   │   ├── current-user.decorator.ts
│   │   ├── jwt-auth.guard.ts
│   │   ├── password.ts
│   │   ├── roles.decorator.ts
│   │   └── roles.guard.ts
│   └── database/
│       └── prisma-errors.ts
├── config/
│   ├── app.config.ts
│   └── env.validation.ts
├── database/
│   ├── database.module.ts
│   └── prisma.service.ts
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
│   ├── tickets/
│   ├── health/
│   └── redis/
├── app.module.ts
└── main.ts
```

### 3.1. Domain modules

| Module | Trách nhiệm |
|---|---|
| `auth` | Register, login, refresh, logout, JWT token service |
| `users` | Lấy thông tin user hiện tại |
| `movies` | Movie catalog và movie lifecycle |
| `cinemas` | Cụm rạp |
| `rooms` | Phòng chiếu |
| `seats` | Ghế vật lý trong phòng |
| `showtimes` | Lịch chiếu và snapshot ghế theo lịch chiếu |
| `bookings` | Hold, checkout, cancel, expire booking |
| `payments` | Mock payment |
| `tickets` | Ticket đã phát hành |
| `health` | Liveness/readiness |
| `redis` | Redis client và lock operations |

### 3.2. Shared infrastructure

- `DatabaseModule` là global module và cung cấp `PrismaService`.
- `RedisModule` là global module và cung cấp `RedisService`.
- `ScheduleModule` chạy scheduler của booking.
- `ConfigModule` là global module, validate environment khi bootstrap.

## 4. Cấu hình môi trường

File mẫu: `.env.example`.

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://ticket_booking:ticket_booking@localhost:5432/ticket_booking?schema=public
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=local-access-secret-change-me-32-chars-minimum
JWT_REFRESH_SECRET=local-refresh-secret-change-me-32-chars-minimum
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=change-this-seed-password
```

| Biến | Bắt buộc | Mô tả |
|---|---|---|
| `NODE_ENV` | Không | `development`, `test` hoặc `production`; default `development` |
| `PORT` | Không | Port HTTP; `main.ts` fallback về `3000` nếu không hợp lệ |
| `DATABASE_URL` | Có | PostgreSQL connection string dùng bởi Prisma |
| `REDIS_URL` | Có | Redis URL, phải dùng protocol `redis` |
| `JWT_ACCESS_SECRET` | Có | Secret ký access token |
| `JWT_REFRESH_SECRET` | Có | Secret ký refresh token; phải khác access secret |
| `JWT_ACCESS_EXPIRES_IN` | Không | TTL access token, default `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Không | TTL refresh token, default `7d` |
| `SEED_ADMIN_EMAIL` | Seed | Email admin bootstrap, default `admin@example.com` |
| `SEED_ADMIN_PASSWORD` | Seed | Password admin bootstrap, bắt buộc khi seed |

### Security rules

- Không commit `.env` thật.
- Không lưu plaintext password hoặc refresh token.
- Production yêu cầu mỗi JWT secret dài tối thiểu 32 ký tự.
- Access và refresh secret phải khác nhau.
- Mock payment chỉ được dùng ở `development` và `test`.

## 5. Database data dictionary

Nguồn chính: `prisma/schema.prisma`.

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

| Giá trị | Ý nghĩa |
|---|---|
| `CUSTOMER` | Người dùng đặt vé |
| `ADMIN` | Quản lý catalog |

#### `MovieStatus`

| Giá trị | Ý nghĩa |
|---|---|
| `DRAFT` | Chưa public |
| `PUBLISHED` | Được hiển thị và dùng để booking |
| `ARCHIVED` | Đã archive, không public |

#### `SeatType`

| Giá trị | Ý nghĩa |
|---|---|
| `STANDARD` | Ghế thường |
| `VIP` | Ghế VIP |
| `COUPLE` | Ghế đôi |

#### `ShowtimeSeatStatus`

| Giá trị | Ý nghĩa |
|---|---|
| `AVAILABLE` | Có thể hold |
| `HELD` | Đang được booking giữ |
| `SOLD` | Đã bán |

#### `BookingStatus`

| Giá trị | Ý nghĩa |
|---|---|
| `PENDING` | Đang giữ ghế/chờ thanh toán |
| `CONFIRMED` | Thanh toán thành công |
| `CANCELLED` | Bị hủy |
| `EXPIRED` | Hết thời gian giữ |

#### `PaymentStatus`

| Giá trị | Ý nghĩa |
|---|---|
| `PENDING` | Checkout tạo payment nhưng chưa có kết quả |
| `SUCCEEDED` | Thanh toán thành công |
| `FAILED` | Thanh toán thất bại |
| `REFUNDED` | Dành cho refund tương lai |

#### `TicketStatus`

| Giá trị | Ý nghĩa |
|---|---|
| `ACTIVE` | Vé có thể sử dụng |
| `USED` | Đã sử dụng |
| `CANCELLED` | Vé đã hủy |

### 5.3. Bảng `User`

Nguồn: `prisma/schema.prisma`, model `User`.

| Field | Type | Nullability | Default/constraint | Mô tả |
|---|---|---|---|---|
| `id` | `String` | REQ | PK, `cuid()` | ID nội bộ |
| `email` | `String` | REQ | UQ | Email đăng nhập, normalize lowercase |
| `passwordHash` | `String` | REQ | — | Hash bằng scrypt |
| `fullName` | `String` | REQ | — | Tên hiển thị |
| `role` | `UserRole` | REQ | `CUSTOMER` | Quyền user |
| `bookings` | `Booking[]` | Relation | — | Các booking của user |
| `refreshTokens` | `RefreshToken[]` | Relation | — | Các session refresh token |
| `createdAt` | `DateTime` | REQ | `now()` | Thời điểm tạo |
| `updatedAt` | `DateTime` | REQ | `@updatedAt` | Thời điểm cập nhật |

### 5.4. Bảng `Movie`

| Field | Type | Nullability | Default/constraint | Mô tả |
|---|---|---|---|---|
| `id` | `String` | REQ | PK, `cuid()` | ID phim |
| `title` | `String` | REQ | — | Tên phim |
| `description` | `String?` | OPT | — | Mô tả phim |
| `duration` | `Int` | REQ | — | Thời lượng, đơn vị phút |
| `status` | `MovieStatus` | REQ | `DRAFT` | Lifecycle phim |
| `showtimes` | `Showtime[]` | Relation | — | Các suất chiếu |
| `createdAt` | `DateTime` | REQ | `now()` | Thời điểm tạo |
| `updatedAt` | `DateTime` | REQ | `@updatedAt` | Thời điểm cập nhật |

### 5.5. Bảng `Cinema`

| Field | Type | Nullability | Default/constraint | Mô tả |
|---|---|---|---|---|
| `id` | `String` | REQ | PK, `cuid()` | ID rạp |
| `name` | `String` | REQ | — | Tên rạp |
| `address` | `String` | REQ | — | Địa chỉ |
| `rooms` | `Room[]` | Relation | — | Các phòng chiếu |
| `createdAt` | `DateTime` | REQ | `now()` | Thời điểm tạo |
| `updatedAt` | `DateTime` | REQ | `@updatedAt` | Thời điểm cập nhật |

Cinema hiện không có unique constraint trên `name` hoặc `address`.

### 5.6. Bảng `Room`

| Field | Type | Nullability | Default/constraint | Mô tả |
|---|---|---|---|---|
| `id` | `String` | REQ | PK, `cuid()` | ID phòng |
| `name` | `String` | REQ | Kết hợp unique với `cinemaId` | Tên phòng trong rạp |
| `cinemaId` | `String` | REQ | FK → `Cinema.id` | Rạp sở hữu phòng |
| `cinema` | `Cinema` | Relation | `onDelete: Cascade` | Rạp cha |
| `seats` | `Seat[]` | Relation | — | Ghế trong phòng |
| `showtimes` | `Showtime[]` | Relation | — | Lịch chiếu trong phòng |
| `createdAt` | `DateTime` | REQ | `now()` | Thời điểm tạo |
| `updatedAt` | `DateTime` | REQ | `@updatedAt` | Thời điểm cập nhật |

Constraint: `@@unique([cinemaId, name])`.

### 5.7. Bảng `Seat`

| Field | Type | Nullability | Default/constraint | Mô tả |
|---|---|---|---|---|
| `id` | `String` | REQ | PK, `cuid()` | ID ghế vật lý |
| `row` | `String` | REQ | — | Hàng ghế, ví dụ `A` |
| `number` | `Int` | REQ | — | Số ghế trong hàng |
| `type` | `SeatType` | REQ | `STANDARD` | Loại ghế |
| `roomId` | `String` | REQ | FK → `Room.id` | Phòng chứa ghế |
| `room` | `Room` | Relation | `onDelete: Cascade` | Phòng cha |
| `showtimeSeats` | `ShowtimeSeat[]` | Relation | — | Snapshot ghế theo showtime |

Constraint: `@@unique([roomId, row, number])`.

Seat không có `createdAt`/`updatedAt`.

### 5.8. Bảng `Showtime`

| Field | Type | Nullability | Default/constraint | Mô tả |
|---|---|---|---|---|
| `id` | `String` | REQ | PK, `cuid()` | ID suất chiếu |
| `startsAt` | `DateTime` | REQ | — | Thời điểm bắt đầu |
| `endsAt` | `DateTime` | REQ | — | Thời điểm kết thúc |
| `movieId` | `String` | REQ | FK → `Movie.id` | Phim được chiếu |
| `movie` | `Movie` | Relation | `onDelete: Restrict` | Phim cha |
| `roomId` | `String` | REQ | FK → `Room.id` | Phòng chiếu |
| `room` | `Room` | Relation | `onDelete: Restrict` | Phòng cha |
| `showtimeSeats` | `ShowtimeSeat[]` | Relation | — | Ghế snapshot |
| `bookings` | `Booking[]` | Relation | — | Booking của suất |
| `createdAt` | `DateTime` | REQ | `now()` | Thời điểm tạo |
| `updatedAt` | `DateTime` | REQ | `@updatedAt` | Thời điểm cập nhật |

Indexes:

- `@@index([movieId, startsAt])`.
- `@@index([roomId, startsAt, endsAt])`.

Database constraints trong migration:

- `startsAt < endsAt`.
- Exclusion constraint không cho overlap trong cùng room với khoảng `[startsAt, endsAt)`. Hai suất liền kề được phép.

### 5.9. Bảng `ShowtimeSeat`

Đây là snapshot của một ghế vật lý trong một suất chiếu. Booking luôn thao tác trên bảng này, không thao tác trực tiếp trên `Seat`.

| Field | Type | Nullability | Default/constraint | Mô tả |
|---|---|---|---|---|
| `id` | `String` | REQ | PK, `cuid()` | ID ghế theo suất |
| `price` | `Decimal(10,2)` | REQ | `>= 0` | Giá ghế tại showtime |
| `status` | `ShowtimeSeatStatus` | REQ | `AVAILABLE` | Trạng thái bán |
| `heldUntil` | `DateTime?` | OPT | — | Thời điểm hold hết hạn |
| `showtimeId` | `String` | REQ | FK → `Showtime.id` | Suất chiếu |
| `showtime` | `Showtime` | Relation | `onDelete: Cascade` | Suất cha |
| `seatId` | `String` | REQ | FK → `Seat.id` | Ghế vật lý |
| `seat` | `Seat` | Relation | `onDelete: Restrict` | Ghế cha |
| `bookingItems` | `BookingItem[]` | Relation | — | Lịch sử item |
| `heldByBookingId` | `String?` | OPT | FK → `Booking.id` | Booking đang sở hữu hold |
| `heldByBooking` | `Booking?` | Relation | `SetNull` | Booking owner của hold |

Constraints/indexes:

- `@@unique([showtimeId, seatId])`.
- `@@index([showtimeId, status])`.
- `@@index([heldByBookingId])`.
- Nếu `status = HELD`, `heldUntil` và `heldByBookingId` phải khác null.
- Nếu `status != HELD`, hai field hold phải null.

### 5.10. Bảng `RefreshToken`

| Field | Type | Nullability | Default/constraint | Mô tả |
|---|---|---|---|---|
| `id` | `String` | REQ | PK, `cuid()` | ID record database |
| `jti` | `String` | REQ | UQ | JWT ID nằm trong token |
| `tokenHash` | `String` | REQ | — | Hash refresh token |
| `expiresAt` | `DateTime` | REQ | — | Hạn token |
| `revokedAt` | `DateTime?` | OPT | — | Thời điểm revoke |
| `userId` | `String` | REQ | FK → `User.id` | User sở hữu token |
| `user` | `User` | Relation | `onDelete: Cascade` | User cha |
| `createdAt` | `DateTime` | REQ | `now()` | Thời điểm tạo |

Indexes:

- `jti` unique.
- `@@index([userId, revokedAt])`.
- `@@index([expiresAt])`.

`id` là ID nội bộ; `jti` là ID của token trong JWT và được dùng để lookup/revoke đúng session.

### 5.11. Bảng `Booking`

| Field | Type | Nullability | Default/constraint | Mô tả |
|---|---|---|---|---|
| `id` | `String` | REQ | PK, `cuid()` | ID booking |
| `status` | `BookingStatus` | REQ | `PENDING` | Lifecycle booking |
| `totalAmount` | `Decimal(10,2)` | REQ | `>= 0` | Tổng tiền server tính |
| `expiresAt` | `DateTime` | REQ | — | Hạn giữ ghế |
| `holdToken` | `String` | REQ | — | Token nội bộ release Redis |
| `idempotencyKey` | `String?` | OPT | Nullable UQ theo user | Key retry hold |
| `requestHash` | `String?` | OPT | — | Fingerprint showtime + seats |
| `userId` | `String` | REQ | FK → `User.id` | User tạo booking |
| `user` | `User` | Relation | `onDelete: Restrict` | User cha |
| `showtimeId` | `String` | REQ | FK → `Showtime.id` | Suất chiếu |
| `showtime` | `Showtime` | Relation | `onDelete: Restrict` | Suất cha |
| `items` | `BookingItem[]` | Relation | — | Các ghế đã chọn |
| `heldSeats` | `ShowtimeSeat[]` | Relation | `BookingSeatHolds` | Ghế booking đang hold |
| `payment` | `Payment?` | Relation | Tối đa một payment |
| `tickets` | `Ticket[]` | Relation | — | Vé phát hành |
| `createdAt` | `DateTime` | REQ | `now()` | Thời điểm tạo |
| `updatedAt` | `DateTime` | REQ | `@updatedAt` | Thời điểm cập nhật |

Constraints/indexes:

- `@@unique([userId, idempotencyKey])`.
- `@@index([holdToken])`.
- `@@index([userId, createdAt])`.
- `@@index([status, expiresAt])`.
- `totalAmount >= 0`.

### 5.12. Bảng `BookingItem`

| Field | Type | Nullability | Default/constraint | Mô tả |
|---|---|---|---|---|
| `id` | `String` | REQ | PK, `cuid()` | ID item |
| `price` | `Decimal(10,2)` | REQ | `>= 0` | Giá snapshot tại booking |
| `bookingId` | `String` | REQ | FK → `Booking.id` | Booking cha |
| `booking` | `Booking` | Relation | `onDelete: Cascade` | Booking |
| `showtimeSeatId` | `String` | REQ | FK → `ShowtimeSeat.id` | Ghế theo suất |
| `showtimeSeat` | `ShowtimeSeat` | Relation | `onDelete: Restrict` | Showtime seat |
| `ticket` | `Ticket?` | Relation | Tối đa một ticket |

Constraint: `@@unique([bookingId, showtimeSeatId])`.

Unique này không cấm ghế xuất hiện trong booking lịch sử khác; nó chỉ cấm duplicate cùng ghế trong cùng một booking.

### 5.13. Bảng `Payment`

| Field | Type | Nullability | Default/constraint | Mô tả |
|---|---|---|---|---|
| `id` | `String` | REQ | PK, `cuid()` | ID payment |
| `provider` | `String` | REQ | — | Hiện tại `MOCK` |
| `reference` | `String?` | OPT | UQ | Reference phía provider |
| `idempotencyKey` | `String?` | OPT | UQ | Key retry payment |
| `status` | `PaymentStatus` | REQ | `PENDING` | Trạng thái giao dịch |
| `amount` | `Decimal(10,2)` | REQ | `>= 0` | Số tiền thanh toán |
| `bookingId` | `String` | REQ | UQ, FK → `Booking.id` | Booking được thanh toán |
| `booking` | `Booking` | Relation | `onDelete: Restrict` | Booking |
| `createdAt` | `DateTime` | REQ | `now()` | Thời điểm tạo |
| `updatedAt` | `DateTime` | REQ | `@updatedAt` | Thời điểm cập nhật |

Một booking tối đa có một Payment. Một payment idempotency key chỉ dùng một lần.

### 5.14. Bảng `Ticket`

| Field | Type | Nullability | Default/constraint | Mô tả |
|---|---|---|---|---|
| `id` | `String` | REQ | PK, `cuid()` | ID ticket |
| `code` | `String` | REQ | UQ | Mã vé public |
| `status` | `TicketStatus` | REQ | `ACTIVE` | Trạng thái vé |
| `bookingId` | `String` | REQ | FK → `Booking.id` | Booking cha |
| `booking` | `Booking` | Relation | `onDelete: Restrict` | Booking |
| `bookingItemId` | `String` | REQ | UQ, FK → `BookingItem.id` | Item tạo ticket |
| `bookingItem` | `BookingItem` | Relation | `onDelete: Restrict` | Item |
| `createdAt` | `DateTime` | REQ | `now()` | Thời điểm tạo |
| `usedAt` | `DateTime?` | OPT | — | Thời điểm sử dụng |

Hiện schema có `USED`/`CANCELLED`, nhưng chưa có API consume/cancel ticket.

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
    ShowtimeSeat ||--o{ BookingItem : selected_in
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
        String title
        String description
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
        String idempotencyKey UK
        PaymentStatus status
        Decimal amount
        String bookingId FK UK
        DateTime createdAt
        DateTime updatedAt
    }
    Ticket {
        String id PK
        String code UK
        TicketStatus status
        String bookingId FK
        String bookingItemId FK UK
        DateTime createdAt
        DateTime usedAt
    }
```

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

| Quan hệ | Cardinality | onDelete |
|---|---|---|
| `User -> Booking` | 1-N | Restrict |
| `User -> RefreshToken` | 1-N | Cascade |
| `Movie -> Showtime` | 1-N | Restrict |
| `Cinema -> Room` | 1-N | Cascade |
| `Room -> Seat` | 1-N | Cascade |
| `Room -> Showtime` | 1-N | Restrict |
| `Showtime -> ShowtimeSeat` | 1-N | Cascade |
| `Seat -> ShowtimeSeat` | 1-N | Restrict |
| `Showtime -> Booking` | 1-N | Restrict |
| `Booking -> BookingItem` | 1-N | Cascade |
| `ShowtimeSeat -> BookingItem` | 1-N | Restrict |
| `Booking -> Payment` | 1-0/1 | Restrict |
| `Booking -> Ticket` | 1-N | Restrict |
| `BookingItem -> Ticket` | 1-0/1 | Restrict |
| `Booking -> ShowtimeSeat.heldByBooking` | 1-N optional | SetNull |

## 6. Migration và seed

### 6.1. Migration history

#### `20260904085503_init`

Tạo schema ban đầu:

- Các enum nghiệp vụ.
- Các bảng `User`, `Movie`, `Cinema`, `Room`, `Seat`, `Showtime`, `ShowtimeSeat`, `Booking`, `BookingItem`, `Payment`, `Ticket`.
- Primary key, relation, unique/index cơ bản.
- Chưa có refresh token, seat state, booking hold token hoặc payment idempotency.
- `BookingItem.showtimeSeatId` ban đầu có unique toàn cục.

#### `20260907100000_booking_flow`

Bổ sung booking flow:

- Enum `ShowtimeSeatStatus`.
- `ShowtimeSeat.status`, `heldUntil`, `heldByBookingId`.
- `Booking.holdToken`, `idempotencyKey`, `requestHash`.
- `Payment.idempotencyKey`.
- Bảng `RefreshToken`.
- Bỏ unique toàn cục trên `BookingItem.showtimeSeatId`.
- Thêm unique cùng booking trên `(bookingId, showtimeSeatId)`.
- Thêm check constraint giá/tổng tiền/trạng thái hold.
- Thêm exclusion constraint chống showtime overlap.
- Backfill booking pending/confirmed/cancelled/expired và seat/payment state cũ.

### 6.2. Seed

File: `prisma/seed.ts`.

Seed chạy idempotent bằng `upsert`:

- Admin:
  - Email từ `SEED_ADMIN_EMAIL`, default `admin@example.com`.
  - Password từ `SEED_ADMIN_PASSWORD`, bắt buộc.
  - Role `ADMIN`.
- Movie:
  - ID `seed-movie-interstellar`.
  - `Interstellar`, duration `169`, status `PUBLISHED`.
- Cinema:
  - ID `seed-cinema-central`.
  - `Central Cinema`, address `1 Example Street`.
- Room:
  - ID `seed-room-1`.
  - `Room 1`.
- Seats:
  - Rows `A`, `B`, `C`, `D`.
  - Mỗi row 8 ghế, tổng 32 ghế.
  - Rows A/B/C là `STANDARD`, row D là `VIP`.
- Showtime:
  - ID `seed-showtime-interstellar`.
  - Bắt đầu khoảng 24 giờ sau thời điểm seed.
  - Kết thúc theo duration phim.
- Showtime seats:
  - Standard: `100000.00`.
  - VIP: `150000.00`.

Seed không tạo customer, booking, payment, ticket hoặc refresh token.

### 6.3. Prisma commands

Project dùng Prisma `6.19.3` và cấu hình seed trong `package.json`:

```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

Các lệnh:

```bash
npm run prisma:generate
npm run prisma:migrate -- --name your-change
npm run prisma:deploy
npm run prisma:seed
npm run prisma:studio
```

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
- Side effect: tạo `User(CUSTOMER)` và `RefreshToken`.
- Errors: `400`, `409` nếu email đã tồn tại.

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
- Errors: `400`, `401` nếu credential sai.

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

### 8.5. Movies API

#### `GET /api/v1/movies`

- Auth: public.
- Chỉ trả movie `PUBLISHED`.
- Query:

| Param | Required | Ví dụ | Mô tả |
|---|---|---|---|
| `search` | Không | `interstellar` | Tìm title, case-insensitive |
| `page` | Không | `1` | Default `1` |
| `pageSize` | Không | `20` | Default `20`, max `100` |

- Success: `200`.

```json
{
  "data": [
    {
      "id": "clx-movie-id",
      "title": "Interstellar",
      "description": "A science fiction film.",
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

### 8.6. Cinemas API

#### `GET /api/v1/cinemas`

- Auth: public.
- Success: `200`.
- Trả cinema và `_count.rooms`.

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
  "address": "208 Nguyen Huu Canh, Ho Chi Minh City"
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

### 8.7. Rooms API

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

### 8.8. Seats API

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
- Unique: `(roomId, row, number)`.

#### `PATCH /api/v1/seats/:id`

- Auth: Bearer JWT.
- Role: `ADMIN`.
- Success: `200`.
- Chỉ cập nhật `type`:

```json
{
  "type": "VIP"
}
```

#### `DELETE /api/v1/seats/:id`

- Auth: Bearer JWT.
- Role: `ADMIN`.
- Success: `200` nếu seat chưa bị showtime sử dụng.

### 8.9. Showtimes API

#### `GET /api/v1/showtimes`

- Auth: public.
- Chỉ trả showtime tương lai của movie `PUBLISHED`.
- Query:

| Param | Required | Ví dụ | Mô tả |
|---|---|---|---|
| `movieId` | Không | `clx-movie-id` | Lọc theo movie |
| `cinemaId` | Không | `clx-cinema-id` | Lọc theo cinema |
| `from` | Không | `2026-10-01T00:00:00.000Z` | Mốc bắt đầu |
| `to` | Không | `2026-10-02T00:00:00.000Z` | Mốc kết thúc |
| `page` | Không | `1` | Default `1` |
| `pageSize` | Không | `20` | Default `20`, max `100` |

- Success: `200`, response `{data, meta}`.
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
- Role: `ADMIN`.
- Success: `201`.
- Body:

```json
{
  "movieId": "clx-movie-id",
  "roomId": "clx-room-id",
  "startsAt": "2026-10-01T19:00:00.000Z",
  "endsAt": "2026-10-01T21:49:00.000Z",
  "basePrice": 100000,
  "vipMultiplier": 1.5,
  "coupleMultiplier": 2
}
```

Rules:

- Movie phải tồn tại và `PUBLISHED`.
- Room phải tồn tại và có ít nhất một seat.
- `startsAt < endsAt`.
- `startsAt` phải ở tương lai.
- Không overlap với showtime khác trong cùng room.
- Standard price = `basePrice`.
- VIP price = `basePrice * vipMultiplier`; default multiplier `1.5`.
- Couple price = `basePrice * coupleMultiplier`; default multiplier `2`.
- Tạo một `ShowtimeSeat` cho mỗi seat của room.

#### `DELETE /api/v1/showtimes/:id`

- Auth: Bearer JWT.
- Role: `ADMIN`.
- Success: `200` nếu chưa có booking.
- Nếu đã có booking: `409`.

### 8.10. Bookings API

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
  "showtimeSeatIds": [
    "clx-showtime-seat-a1",
    "clx-showtime-seat-a2"
  ]
}
```

Validation:

- `showtimeId`: non-empty string.
- `showtimeSeatIds`: array, tối thiểu 1, tối đa 10.
- Các seat ID phải unique.

State effect:

1. Verify showtime published/chưa bắt đầu.
2. Verify seat IDs thuộc đúng showtime.
3. Sinh `holdToken` nội bộ.
4. Redis `SET NX EX 600` cho từng ghế.
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

#### `POST /api/v1/bookings/:id/checkout`

- Auth: Bearer JWT.
- Success: `201`.
- Không cần body.
- Kiểm tra booking còn `PENDING`, chưa hết hạn và còn sở hữu toàn bộ seat.
- Transaction tạo hoặc reuse `Payment(PENDING, provider=MOCK)`.
- Trả raw payment record.

#### `POST /api/v1/bookings/:id/cancel`

- Auth: Bearer JWT.
- Success: `201`.
- Chỉ booking `PENDING` được cancel.
- State effect:
  - Booking → `CANCELLED`.
  - Payment pending → `FAILED`.
  - Seat hold → `AVAILABLE`.
  - Release Redis lock.
- Errors: `401`, `404`, `409`.

### 8.11. Payments API

#### `POST /api/v1/payments/mock/:bookingId`

- Auth: Bearer JWT.
- Success: `201`.
- Chỉ hoạt động với `NODE_ENV=development` hoặc `test`.
- Idempotency key bắt buộc từ header hoặc body.

Header:

```http
Idempotency-Key: payment-attempt-001
```

Body:

```json
{
  "reference": "MOCK-PAYMENT-001",
  "success": true
}
```

Field:

| Field | Required | Mô tả |
|---|---|---|
| `reference` | Không | Reference provider, max 100 |
| `success` | Không | Default behavior là success nếu khác `false` |
| `idempotencyKey` | Header hoặc body | Key retry, 8-100 ký tự khi validate body |

Success flow:

1. Check environment và idempotency key.
2. Verify booking thuộc user.
3. Verify booking pending/chưa hết hạn.
4. Verify booking vẫn sở hữu tất cả held seat.
5. Payment → `SUCCEEDED`.
6. Booking → `CONFIRMED`.
7. Seat → `SOLD`.
8. Upsert ticket từng booking item.
9. Release Redis lock sau commit.

Failure flow (`success: false`):

1. Payment → `FAILED`.
2. Booking → `CANCELLED`.
3. Seat → `AVAILABLE`.
4. Clear hold fields.
5. Release Redis lock.

Idempotency:

- Cùng key + cùng booking trả kết quả cũ.
- Key đã dùng cho booking khác: `409`.
- Reference/idempotency collision: `409`.
- Payment success retry không tạo ticket trùng nhờ `Ticket.bookingItemId` unique và upsert.

#### Payment response

Response có dạng:

```json
{
  "payment": {
    "id": "clx-payment-id",
    "provider": "MOCK",
    "reference": "MOCK-PAYMENT-001",
    "idempotencyKey": "payment-attempt-001",
    "status": "SUCCEEDED",
    "amount": "100000.00",
    "bookingId": "clx-booking-id",
    "createdAt": "2026-09-07T10:00:00.000Z",
    "updatedAt": "2026-09-07T10:00:00.000Z"
  },
  "booking": {
    "id": "clx-booking-id",
    "status": "CONFIRMED"
  }
}
```

### 8.12. Tickets API

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
POST /bookings/:id/checkout
    ↓
POST /payments/mock/:bookingId
    ↓
GET /tickets
```

### 9.2. Admin flow

```text
Seed hoặc login admin
    ↓
POST /movies
    ↓
POST /cinemas
    ↓
POST /rooms
    ↓
POST /seats/:roomId
    ↓
POST /showtimes
```

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

    C->>API: POST /bookings/:id/checkout
    API->>DB: Transaction: verify booking and held seats
    DB-->>API: Payment PENDING
    API-->>C: Payment PENDING

    C->>API: POST /payments/mock/:bookingId\nIdempotency-Key
    API->>DB: Transaction: verify state and ownership
    alt Success
        API->>DB: Payment SUCCEEDED
        API->>DB: Booking CONFIRMED
        API->>DB: Seats SOLD
        API->>DB: Upsert tickets
        API->>R: Release owned locks
        API-->>C: Confirmed booking and tickets
    else Failure
        API->>DB: Payment FAILED
        API->>DB: Booking CANCELLED
        API->>DB: Seats AVAILABLE
        API->>R: Release owned locks
        API-->>C: Failed payment
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

### 10.4. Payment idempotency

`Payment` lưu:

- `idempotencyKey` unique.
- `reference` unique.
- `bookingId` unique.

Ticket dùng `bookingItemId` unique; payment success retry sử dụng upsert để không phát hành duplicate ticket.

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

File: `src/modules/bookings/booking-expiry.scheduler.ts`.

- Cron: mỗi phút.
- Gọi `BookingsService.expireBookings()`.
- Tìm booking `PENDING` hết hạn.
- Chuyển booking thành `EXPIRED`.
- Chuyển payment pending thành `FAILED`.
- Release seat và Redis lock.

### 11.2. Request-driven expiry

Một số request có thể gọi expiry cho booking mục tiêu trước khi đọc/thao tác:

- Lấy booking detail.
- Cancel.
- Checkout/payment flow.

Scheduler vẫn là cơ chế chính để cleanup toàn hệ thống.

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

| Status | Ý nghĩa |
|---:|---|
| `200` | GET/PATCH/DELETE hoặc action khai báo OK |
| `201` | POST mặc định của NestJS |
| `204` | Logout thành công, không body |
| `400` | Validation hoặc business input sai |
| `401` | Thiếu/sai/expired JWT hoặc refresh token |
| `403` | Không đủ role hoặc mock payment bị disable |
| `404` | Resource không tồn tại hoặc không thuộc user |
| `409` | Duplicate, seat conflict, overlap, state conflict, idempotency conflict |
| `503` | Database/Redis readiness không sẵn sàng |

### 12.3. Error response

NestJS hiện dùng HTTP exception mặc định. Ví dụ:

```json
{
  "statusCode": 409,
  "message": "One or more seats are being held",
  "error": "Conflict"
}
```

Chưa có global custom exception filter để chuẩn hóa error code/trace ID.

## 13. Testing

### 13.1. Test scripts

```bash
npm test
npm run test:e2e
npm run test:cov
npm run typecheck
npm run lint
npm run build
```

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

### 13.3. Test chưa có

Cần bổ sung integration test với PostgreSQL/Redis thật cho:

- Hai user giữ cùng seat đồng thời.
- Retry cùng hold idempotency key.
- Cùng idempotency key nhưng payload khác.
- Booking expiry giải phóng seat.
- Payment success retry không tạo ticket trùng.
- Payment failure giải phóng seat.
- Hai showtime overlap cùng room.
- Migration backfill trên dữ liệu cũ.
- Refresh token rotation concurrent.

## 14. Cách chạy project

### 14.1. Setup

Linux/macOS/Git Bash:

```bash
cp .env.example .env
npm install
docker compose up -d --wait
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm run start:dev
```

PowerShell:

```powershell
Copy-Item .env.example .env
npm install
docker compose up -d --wait
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm run start:dev
```

### 14.2. Kiểm tra nhanh

```bash
curl http://localhost:3000/api/v1/health
curl http://localhost:3000/api/v1/movies
```

Mở Swagger:

```text
http://localhost:3000/api/docs
```

### 14.3. Manual flow mẫu

1. Seed admin.
2. Login admin qua `/api/v1/auth/login`.
3. Dùng `Authorize` trên Swagger với access token.
4. Tạo/publish movie nếu không dùng seed.
5. Tạo cinema, room, seats, showtime.
6. Register/login customer.
7. Lấy showtime seats.
8. Hold một hoặc nhiều ghế.
9. Checkout booking.
10. Gọi mock payment với `Idempotency-Key`.
11. Lấy ticket.

## 15. Known limitations và roadmap

### 15.1. Limitations hiện tại

- Mock payment chưa phải payment provider thật.
- Chưa có webhook signature verification.
- Chưa có refund flow dù enum `REFUNDED` đã tồn tại.
- Chưa có ticket check-in/consume.
- Chưa có admin user management.
- Chưa có update showtime endpoint.
- Booking list chưa pagination.
- Chưa có response DTO riêng; một số endpoint trả trực tiếp Prisma object.
- Một số response booking có thể còn field kỹ thuật nested như `heldByBookingId`/`requestHash` tùy include.
- Chưa có Dockerfile cho API.
- Chưa có CI/CD.
- Chưa có rate limiting, Helmet, structured logging và tracing.
- Chưa có integration/concurrency test với PostgreSQL/Redis thật.
- `prisma:seed` cập nhật admin role/name nhưng không đổi password nếu admin đã tồn tại.

### 15.2. Roadmap đề xuất

1. Bổ sung response DTO và custom error format.
2. Tách payment provider interface khỏi mock provider.
3. Thêm webhook và payment attempt/event table.
4. Thêm ticket scan/check-in.
5. Thêm admin user management và audit log.
6. Thêm pagination/filter/sort chuẩn hóa cho booking/ticket/catalog.
7. Bổ sung integration/concurrency test chạy bằng Docker.
8. Thêm rate limiting, Helmet, logging, metrics và tracing.
9. Thêm cleanup job cho refresh token hết hạn.
10. Tạo Dockerfile/API container và CI pipeline.
11. Kiểm tra `npm audit` và cập nhật dependencies.
