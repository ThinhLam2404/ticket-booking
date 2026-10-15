import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { CustomOrigin } from '@nestjs/common/interfaces/external/cors-options.interface.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiExceptionFilter } from '../common/http/filters/api-exception.filter.js';

export function createOpenApiDocument(app: INestApplication) {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Movie Ticket Booking API')
    .setDescription('API for booking movie tickets')
    .setVersion('1.0')
    .addBearerAuth()
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Metrics token',
        description: 'Bearer token from METRICS_TOKEN',
      },
      'metrics',
    )
    .build();

  return SwaggerModule.createDocument(app, swaggerConfig, {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
}

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const expressApp = app as NestExpressApplication;
  const nodeEnv = config.get<string>('NODE_ENV') ?? 'development';
  const corsOrigins = (
    config.get<string>('CORS_ORIGINS') ?? 'http://localhost:5173'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const trustProxy = config.get<string>('TRUST_PROXY') ?? 'false';
  const trustProxyValue =
    trustProxy === 'true'
      ? true
      : trustProxy === 'false'
        ? false
        : Number.isInteger(Number(trustProxy)) && Number(trustProxy) >= 0
          ? Number(trustProxy)
          : false;
  app.setGlobalPrefix('api/v1');
  expressApp.set('trust proxy', trustProxyValue);
  //NOTE - giới hạn body parser hạn chế tiêu tốn memory
  expressApp.useBodyParser('json', {
    limit: config.get<string>('REQUEST_BODY_LIMIT') ?? '256kb',
  });
  expressApp.useBodyParser('urlencoded', {
    extended: false,
    limit: config.get<string>('REQUEST_BODY_LIMIT') ?? '256kb',
  });
  //NOTE - middleware http security cho headers
  app.use(helmet());
  app.enableCors({
    credentials: true,
    origin: ((origin, callback) => {
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    }) as CustomOrigin,
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerSetting = config.get<string>('SWAGGER_ENABLED');
  const swaggerEnabled =
    swaggerSetting === 'true' ||
    (swaggerSetting !== 'false' && nodeEnv !== 'production');
  if (swaggerEnabled) {
    const document = createOpenApiDocument(app);
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: 'api/docs-json',
    });
  }
}
