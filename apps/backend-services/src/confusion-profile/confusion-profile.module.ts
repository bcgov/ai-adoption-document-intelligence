import { Module } from "@nestjs/common";
import { BenchmarkModule } from "@/benchmark/benchmark.module";
import { DatabaseModule } from "@/database/database.module";
import { ConfusionProfileController } from "./confusion-profile.controller";
import { ConfusionProfileService } from "./confusion-profile.service";

@Module({
  imports: [DatabaseModule, BenchmarkModule],
  controllers: [ConfusionProfileController],
  providers: [ConfusionProfileService],
  exports: [ConfusionProfileService],
})
export class ConfusionProfileModule {}
