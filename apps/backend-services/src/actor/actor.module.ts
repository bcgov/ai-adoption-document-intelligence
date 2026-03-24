import { Module } from "@nestjs/common";
import { ApiKeyController } from "./api-key.controller";
import { ApiKeyService } from "./api-key.service";
import { ApiKeyDbService } from "./api-key-db.service";
import { UserDbService } from "./user-db.service";
import { UserService } from "./user.service";

@Module({
  imports: [],
  controllers: [ApiKeyController],
  providers: [ApiKeyDbService, ApiKeyService, UserDbService, UserService],
  exports: [ApiKeyService, UserService],
})
export class ActorModule {}
