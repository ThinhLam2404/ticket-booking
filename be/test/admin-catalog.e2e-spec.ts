import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/config/app.config.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { JwtTokenService } from '../src/modules/auth/jwt-token.service.js';
import { RedisService } from '../src/modules/redis/redis.service.js';
import { UserRole } from '@prisma/client';

function createPrismaMock() {
  const prisma = {
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $transaction: vi.fn(async (operations: unknown) =>
      Array.isArray(operations)
        ? Promise.all(operations)
        : (operations as (client: typeof prisma) => unknown)(prisma),
    ),
    user: { findUnique: vi.fn() },
    movie: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
  return prisma;
}

describe('Admin catalog authorization (e2e)', () => {
  let app: INestApplication;
  const prisma = createPrismaMock();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue({
        ping: vi.fn().mockResolvedValue('PONG'),
        onModuleDestroy: vi.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('rejects unauthenticated and customer access to the admin movie list', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/movies/admin')
      .expect(401);

    prisma.user.findUnique.mockResolvedValue({
      id: 'customer-1',
      email: 'customer@example.com',
      fullName: 'Customer',
      role: UserRole.CUSTOMER,
    });
    const token = app.get(JwtTokenService).createAccessToken({
      id: 'customer-1',
      email: 'customer@example.com',
      fullName: 'Customer',
      role: UserRole.CUSTOMER,
    });

    await request(app.getHttpServer())
      .get('/api/v1/movies/admin')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('allows an admin to use the protected movie list route', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      fullName: 'Admin',
      role: UserRole.ADMIN,
    });
    const token = app.get(JwtTokenService).createAccessToken({
      id: 'admin-1',
      email: 'admin@example.com',
      fullName: 'Admin',
      role: UserRole.ADMIN,
    });

    await request(app.getHttpServer())
      .get('/api/v1/movies/admin?status=DRAFT')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.meta).toMatchObject({ page: 1, pageSize: 20, total: 0 });
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
