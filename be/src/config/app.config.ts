import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiExceptionFilter } from '../common/http/filters/api-exception.filter.js';

export function createOpenApiDocument(app: INestApplication) {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Movie Ticket Booking API')
    .setDescription('API for booking movie tickets')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  return SwaggerModule.createDocument(app, swaggerConfig, {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
}

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
  app.enableCors();
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const document = createOpenApiDocument(app);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });
}
