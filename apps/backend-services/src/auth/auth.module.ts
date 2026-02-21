import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { PassportModule } from "@nestjs/passport";
import { ApiKeyModule } from "../api-key/api-key.module";
import { ApiKeyAuthGuard } from "./api-key-auth.guard";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { CsrfGuard } from "./csrf.guard";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { KeycloakJwtStrategy } from "./keycloak-jwt.strategy";
import { RolesGuard } from "./roles.guard";

@Module({
  imports: [ConfigModule, PassportModule.register({ defaultStrategy: "jwt" }), ApiKeyModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    KeycloakJwtStrategy,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
