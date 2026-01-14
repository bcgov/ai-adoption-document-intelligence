import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ApiKeyModule } from "../api-key/api-key.module";
import { ApiKeyAuthGuard } from "./api-key-auth.guard";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthSessionStore } from "./auth-session.store";
import { BCGovAuthGuard } from "./bcgov-auth.guard";
import { RolesGuard } from "./roles.guard";

@Module({
  imports: [ConfigModule, ApiKeyModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthSessionStore,
    {
      provide: APP_GUARD,
      useClass: BCGovAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
