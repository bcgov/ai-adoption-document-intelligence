// Load .env before any module is resolved so that process.env is populated
// when decorators (e.g. @Throttle) are evaluated at import time.
import "dotenv/config";

import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { json, urlencoded } from "body-parser";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { FileLogger } from "./logger/file-logger.service";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";

const fileLogger = new FileLogger();
const logger = new Logger("Bootstrap");

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: fileLogger,
  });

  // Enable HTTP request/response logging for debugging Playwright tests
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Cookie parser must be registered before routes are mounted
  app.use(cookieParser());

  // Helmet sets HTTP response headers that tell browsers to enable security
  // features. These are defense-in-depth measures — they don't replace server-side
  // validation but add extra layers if other defenses (e.g. XSS filtering) fail.
  // Must be registered before routes so every response gets the headers.
  app.use(
    helmet({
      // Content-Security-Policy (CSP): tells the browser which sources are allowed
      // to load scripts, styles, images, etc. If an attacker injects a <script> tag
      // pointing to evil.com, the browser blocks it because evil.com isn't in the
      // allowlist. 'unsafe-inline' is required for Swagger UI's inline styles/scripts.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https://validator.swagger.io"],
        },
      },
      // Strict-Transport-Security (HSTS): once a browser sees this header, it will
      // refuse to connect over plain HTTP for the specified duration — even if the
      // user types http://. This prevents SSL-stripping attacks where a MITM
      // downgrades the connection to unencrypted HTTP.
      hsts: {
        maxAge: 31_536_000, // 1 year in seconds
        includeSubDomains: true,
      },
      // X-Frame-Options: "deny" prevents the page from being embedded in an iframe
      // on any site. This blocks clickjacking attacks where an attacker overlays
      // an invisible iframe of our app over a decoy page to trick users into
      // clicking buttons they can't see (e.g. "Delete my account").
      frameguard: { action: "deny" },
      // X-Content-Type-Options: "nosniff" stops the browser from guessing the MIME
      // type of a response. Without this, a browser might interpret a JSON or text
      // response as HTML/JavaScript if an attacker can control the content, enabling
      // XSS via content-type sniffing.
      noSniff: true,
      // Referrer-Policy: controls how much URL information is sent in the Referer
      // header when navigating away. "strict-origin-when-cross-origin" sends the
      // full URL for same-origin requests but only the origin (no path/query) for
      // cross-origin ones — prevents leaking sensitive URL params (tokens, IDs)
      // to external sites.
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
