import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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
      .overrideProvider(PrismaService)
      .useValue({
        $connect: async () => undefined,
        $disconnect: async () => undefined,
        $queryRaw: async () => [{ '?column?': 1 }],
      })
      .overrideProvider(RedisService)
      .useValue({
        ping: async () => 'PONG',
        onModuleDestroy: () => undefined,
      })
      .compile();

    app = moduleFixture.createNestApplication();
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
    expect(response.body.paths['/api/v1/payments/mock/{bookingId}'].post.responses['201'])
      .toMatchObject({
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/MockPaymentResponseDto',
            },
          },
        },
      });
    expect(response.body.components.schemas.ApiErrorResponseDto).toBeDefined();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });
});
