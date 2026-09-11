# Movie Ticket Booking Backend

Backend NestJS của hệ thống đặt vé phim. Tài liệu system/API dùng chung nằm tại [`../docs/SYSTEM_AND_API.md`](../docs/SYSTEM_AND_API.md).

## Công nghệ

- NestJS 12, Express và TypeScript
- PostgreSQL 17 và Prisma 6.19.3
- Redis 7
- JWT authentication và role authorization
- Swagger/OpenAPI
- Vitest và Supertest

## Cấu trúc

```text
be/
├── prisma/
├── src/
│   ├── common/
│   ├── config/
│   ├── database/
│   └── modules/
├── test/
├── docker-compose.yml
└── package.json
```

## Chạy từ repository root

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

`npm run dev` chạy backend watch và frontend Vite song song. Nếu chỉ cần backend, chạy `npm run dev:be`.

## Backend commands

Các lệnh root tương ứng:

```bash
npm run dev:be
npm run build:be
npm run lint:be
npm run typecheck:be
npm test
npm run test:e2e
npm run prisma:studio
```

Có thể chạy trực tiếp trong thư mục `be` bằng các scripts trong `be/package.json`.

## Runtime

- API root: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/api/docs`
- Readiness: `http://localhost:3000/api/v1/health/ready`

PostgreSQL và Redis được khai báo trong `be/docker-compose.yml`. Mock payment chỉ hoạt động ở `development` và `test`.
