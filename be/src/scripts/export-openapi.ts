import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module.js';
import { configureApp, createOpenApiDocument } from '../config/app.config.js';
import { PrismaService } from '../database/prisma.service.js';
import { RedisService } from '../modules/redis/redis.service.js';

const outputPath = resolve(
  process.cwd(),
  process.argv[2] ?? '../openapi/ticket-booking.openapi.json',
);

const generationEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL:
    'postgresql://openapi:openapi@127.0.0.1:59999/openapi_generation',
  REDIS_URL: 'redis://127.0.0.1:59998/0',
  JWT_ACCESS_SECRET: 'openapi-generation-access-secret',
  JWT_REFRESH_SECRET: 'openapi-generation-refresh-secret',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  MAIL_WORKER_ENABLED: 'false',
};

for (const [key, value] of Object.entries(generationEnvironment)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

const moduleFixture = await Test.createTestingModule({
  imports: [AppModule],
})
  .overrideProvider(ConfigService)
  .useValue({
    get: <T>(key: string) =>
      generationEnvironment[key as keyof typeof generationEnvironment] as T,
  })
  .overrideProvider(PrismaService)
  .useValue({})
  .overrideProvider(RedisService)
  .useValue({})
  .compile();

const app = moduleFixture.createNestApplication({ bodyParser: false });
configureApp(app);
const document = createOpenApiDocument(app);
await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
await app.close();
process.stdout.write(`OpenAPI document written to ${outputPath}\n`);
