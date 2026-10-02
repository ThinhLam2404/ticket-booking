import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './config/app.config.js';
import { requestLogger } from './common/logging/request-logger.middleware.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableShutdownHooks();
  app.use(requestLogger);
  configureApp(app);
  const configuredPort = process.env.PORT?.trim();
  const parsedPort = configuredPort ? Number(configuredPort) : Number.NaN;
  const port =
    Number.isInteger(parsedPort) && parsedPort >= 0
      ? parsedPort
      : 3000;
  await app.listen(port);
}
await bootstrap();
