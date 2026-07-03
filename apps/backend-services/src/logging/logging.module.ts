import { Global, Module, type NestModule } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { MetricsModule } from "@/metrics/metrics.module";
import { AppLoggerService } from "./app-logger.service";
import { ClientErrorController } from "./client-error.controller";
import { LoggingMiddleware } from "./logging.middleware";
import { RequestLoggingInterceptor } from "./request-logging.interceptor";

@Global()
@Module({
  imports: [MetricsModule],
  controllers: [ClientErrorController],
  providers: [
    AppLoggerService,
    LoggingMiddleware,
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
  ],
  exports: [AppLoggerService],
})
export class LoggingModule implements NestModule {
  configure(consumer: import("@nestjs/common").MiddlewareConsumer): void {
    consumer.apply(LoggingMiddleware).forRoutes("*");
  }
}
