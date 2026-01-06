import { HttpService } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "../../src/auth/auth.controller";
import { AuthService } from "../../src/auth/auth.service";
import { AuthSessionStore } from "../../src/auth/auth-session.store";
import { DatabaseModule } from "../../src/database/database.module";
import { DocumentModule } from "../../src/document/document.module";
import { OcrModule } from "../../src/ocr/ocr.module";
import { QueueModule } from "../../src/queue/queue.module";
import { UploadModule } from "../../src/upload/upload.module";

// Composite Mock Guard for tests (configurable per test)
export class CompositeMockGuard {
  static mockUser = {
    idir_username: "testuser",
    display_name: "Test User",
    email: "test@example.com",
    roles: ["user", "admin"],
  };
  canActivate(context: {
    switchToHttp: () => { (): Function; getRequest: { (): { user: Object } } };
  }) {
    const req = context.switchToHttp().getRequest();
    req.user = { ...CompositeMockGuard.mockUser };
    return true;
  }
}

// Export a mutable mock for per-test overrides
export const httpServiceMock = {
  post: jest.fn().mockReturnValue({
    toPromise: async () => ({
      status: 202,
      headers: { "apim-request-id": "mock-id" },
    }),
    subscribe: () => {},
  }),
  get: jest.fn().mockReturnValue({
    toPromise: async () => ({
      status: 200,
      data: {
        status: "succeeded",
        createdDateTime: new Date().toISOString(),
        lastUpdatedDateTime: new Date().toISOString(),
        analyzeResult: { content: "mock-content", pages: [] },
      },
    }),
    subscribe: () => {},
  }),
};

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ".env", cache: true }),
    DatabaseModule,
    DocumentModule,
    QueueModule,
    UploadModule,
    OcrModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthSessionStore,
    { provide: APP_GUARD, useClass: CompositeMockGuard },
    {
      provide: HttpService,
      useValue: httpServiceMock,
    },
  ],
})
export class TestAppModule {}
