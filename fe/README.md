# CineBook frontend

Frontend React/Vite tối giản để test customer flow của backend:

- Register/login.
- Movie catalog và search.
- Showtime selection.
- Seat map với trạng thái `AVAILABLE`, `HELD`, `SOLD`.
- Hold ghế bằng `Idempotency-Key`.
- Checkout và mock payment success/failure.
- Booking history.
- Ticket history.

## Chạy local

Từ repository root:

```bash
npm install
npm run install:all
npm run dev:fe
```

Hoặc chạy cả backend và frontend cùng lúc:

```bash
npm run dev
```

Nếu chạy trực tiếp trong thư mục `fe`, dùng `npm install` và `npm run dev`.

Frontend mặc định gọi backend tại:

```text
http://localhost:3000/api/v1
```

Có thể đổi bằng biến Vite:

```env
VITE_API_URL=http://localhost:3000/api/v1
```

## Build

Từ repository root:

```bash
npm run lint:fe
npm run typecheck:fe
npm run build:fe
```

Hoặc chạy trực tiếp trong thư mục `fe`:

```bash
npm run lint
npm run typecheck
npm run build
```

Backend cần chạy trước và PostgreSQL/Redis cần sẵn sàng nếu muốn test flow booking thật. Tài liệu contract dùng chung nằm tại [`../README.md`](../README.md).
