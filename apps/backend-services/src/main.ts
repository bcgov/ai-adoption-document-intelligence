import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { json, urlencoded } from "body-parser";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";

const logger = new Logger("Bootstrap");

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Cookie parser must be registered before routes are mounted
  app.use(cookieParser());

  // Security headers via helmet — must be registered before routes
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https://validator.swagger.io"],
        },
      },
      // HSTS: enforce HTTPS for 1 year, include subdomains
      hsts: {
        maxAge: 31_536_000,
        includeSubDomains: true,
      },
      // Prevent clickjacking
      frameguard: { action: "deny" },
      // Prevent MIME type sniffing
      noSniff: true,
      // Control referrer information
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    }),
  );

  // Swagger (OpenAPI) Setup
  const config = new DocumentBuilder()
    .setTitle("CITZ OCR Service") // Taking suggestions on names
    .setDescription("API documentation for the CITZ OCR service.")
    .setVersion("1.0") // Would be interesting if we can tie this to actual versioning.
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      "keycloak-sso", // This is the name/key for the security scheme
    )
    .addApiKey({ type: "apiKey", name: "x-api-key", in: "header" }, "api-key")
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, documentFactory);

  app.use(
    json({
      limit: process.env.BODY_LIMIT || "50mb",
    }),
  );
  app.use(
    urlencoded({
      limit: process.env.BODY_LIMIT || "50mb",
      extended: true,
    }),
  );

  // Enable CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
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
  await app.listen(port, "0.0.0.0");
  logger.log(`Backend services is running on: http://localhost:${port}`);
  logger.log(`Upload endpoint: http://localhost:${port}/api/upload`);
}

bootstrap();
