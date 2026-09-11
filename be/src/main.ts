import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './config/app.config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const configuredPort = Number(process.env.PORT);
  const port =
    Number.isInteger(configuredPort) && configuredPort >= 0
      ? configuredPort
      : 3000;
  await app.listen(port);
}
await bootstrap();
