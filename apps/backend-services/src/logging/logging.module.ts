import { Global, Module, type NestModule } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AppLoggerService } from "./app-logger.service";
import { LoggingMiddleware } from "./logging.middleware";
import { RequestLoggingInterceptor } from "./request-logging.interceptor";

@Global()
@Module({
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
