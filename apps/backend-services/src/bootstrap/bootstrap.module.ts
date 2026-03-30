import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "../database/database.module";
import { BootstrapController } from "./bootstrap.controller";
import { BootstrapService } from "./bootstrap.service";

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [BootstrapController],
  providers: [BootstrapService],
})
export class BootstrapModule {}
