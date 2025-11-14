import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

const logger = new Logger('Bootstrap');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Get the underlying Express instance
  const expressApp = app.getHttpAdapter().getInstance();

  // Set up BC Gov SSO middleware for global configuration
  // This initializes the SSO system
  const { sso } = await import('@bcgov/citz-imb-sso-express');
  sso(expressApp, {
    afterUserLogin: (user) => {
      logger.log(`User logged in: ${user?.username}`);
    },
    afterUserLogout: (user) => {
      logger.log(`User logged out: ${user?.username}`);
    },
  });

  // Enable CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // Enable validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.PORT || 3002;
  await app.listen(port, '0.0.0.0');
  logger.log(`Backend services is running on: http://localhost:${port}`);
  logger.log(`Upload endpoint: http://localhost:${port}/api/upload`);
}

bootstrap();

