import { Module } from "@nestjs/common";
import { ApiKeyController } from "./api-key.controller";
import { ApiKeyService } from "./api-key.service";
import { ApiKeyDbService } from "./api-key-db.service";

@Module({
  imports: [],
  controllers: [ApiKeyController],
  providers: [ApiKeyDbService, ApiKeyService],
  exports: [ApiKeyService],
})
export class ApiKeyModule {}
