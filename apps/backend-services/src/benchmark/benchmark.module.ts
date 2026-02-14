import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatasetController } from "./dataset.controller";
import { DatasetService } from "./dataset.service";
import { DvcService } from "./dvc.service";
import { MlflowClientService } from "./mlflow-client.service";

@Module({
  imports: [ConfigModule],
  controllers: [DatasetController],
  providers: [DatasetService, DvcService, MlflowClientService],
  exports: [DatasetService, DvcService, MlflowClientService],
})
export class BenchmarkModule {}
