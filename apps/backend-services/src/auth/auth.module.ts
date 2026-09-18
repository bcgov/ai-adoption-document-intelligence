import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { PassportModule } from "@nestjs/passport";
import { ActorModule } from "@/actor/actor.module";
import { GroupModule } from "../group/group.module";
import { ApiKeyAuthGuard } from "./api-key-auth.guard";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { CsrfGuard } from "./csrf.guard";
import { IdentityGuard } from "./identity.guard";
import { InternalTokenService } from "./internal-token.service";
import { InternalTokenAuthGuard } from "./internal-token-auth.guard";
import { InternalTokenDbService } from "./internal-token-db.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { KeycloakJwtStrategy } from "./keycloak-jwt.strategy";

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    ActorModule,
    GroupModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    KeycloakJwtStrategy,
    InternalTokenDbService,
    InternalTokenService,
    // Global guards run in registration order: JWT → API key → internal
    // token → identity resolution → CSRF. InternalTokenAuthGuard must sit
    // after ApiKeyAuthGuard (another credential wins over the token) and
    // before IdentityGuard (which enriches request.internalToken into a
    // resolvedIdentity).
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
      useClass: InternalTokenAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: IdentityGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
  exports: [AuthService, InternalTokenService],
})
export class AuthModule {}
