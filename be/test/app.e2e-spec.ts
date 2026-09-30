import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/config/app.config.js';
import { PrismaService } from './../src/database/prisma.service.js';
import { RedisService } from './../src/modules/redis/redis.service.js';

describe('Application (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: <T>(key: string) =>
          ({
            NODE_ENV: 'test',
            JWT_ACCESS_SECRET: 'test-access-secret',
            JWT_REFRESH_SECRET: 'test-refresh-secret',
            JWT_ACCESS_EXPIRES_IN: '15m',
            JWT_REFRESH_EXPIRES_IN: '7d',
            CORS_ORIGINS: 'http://localhost:5173',
            SWAGGER_ENABLED: 'true',
            REQUEST_BODY_LIMIT: '256kb',
            TRUST_PROXY: 'false',
          }[key] as T | undefined),
      })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: async () => undefined,
        $disconnect: async () => undefined,
        $queryRaw: async () => [{ '?column?': 1 }],
      })
      .overrideProvider(RedisService)
      .useValue({
        ping: async () => 'PONG',
        incrementWithExpiry: async () => 1,
        onModuleDestroy: () => undefined,
      })
      .compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
  });

  it('serves the root route under the API prefix', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect('Hello World!');
  });

  it('serves liveness without dependencies', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('ok');
        expect(body.service).toBe('ticket-booking-api');
      });
  });

  it('validates auth payloads', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'invalid' })
      .expect(400);
  });

  it('returns 429 when Redis reports an exhausted login window', async () => {
    const redis = app.get(RedisService);
    vi.spyOn(redis, 'incrementWithExpiry').mockResolvedValue(11);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'user@example.com', password: 'Password123!' })
      .expect(429)
      .expect(({ body }) => {
        expect(body.code).toBe('RATE_LIMITED');
      });
  });

  it('publishes the frontend-facing OpenAPI response contracts', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);

    expect(response.body.paths['/api/v1/movies'].get.responses['200'])
      .toMatchObject({
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/PaginatedMoviesResponseDto',
            },
          },
        },
      });
    expect(response.body.paths['/api/v1/showtimes'].get.responses['200'])
      .toMatchObject({
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/PaginatedShowtimesResponseDto',
            },
          },
        },
      });
    expect(response.body.paths['/api/v1/showtimes/{id}/seats'].get.responses['200'])
      .toMatchObject({
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ShowtimeSeatsResponseDto',
            },
          },
        },
      });
    expect(response.body.paths['/api/v1/payments/bookings/{bookingId}/checkout'].post.responses['201'])
      .toMatchObject({
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/SepayCheckoutResponseDto',
            },
          },
        },
      });
    expect(response.body.paths['/api/v1/payments/sepay/webhook'].post.responses['201']).toBeDefined();
    expect(response.body.components.schemas.ApiErrorResponseDto).toBeDefined();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });
});
