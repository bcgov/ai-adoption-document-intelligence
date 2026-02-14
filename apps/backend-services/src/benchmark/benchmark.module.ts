import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { DatasetController } from "./dataset.controller";
import { DatasetService } from "./dataset.service";
import { DvcService } from "./dvc.service";
import { MlflowClientService } from "./mlflow-client.service";
import { BenchmarkProjectController } from "./benchmark-project.controller";
import { BenchmarkProjectService } from "./benchmark-project.service";
import { BenchmarkDefinitionController } from "./benchmark-definition.controller";
import { BenchmarkDefinitionService } from "./benchmark-definition.service";
import { EvaluatorRegistryService } from "./evaluator-registry.service";

@Module({
  imports: [ConfigModule, HttpModule],
  controllers: [
    DatasetController,
    BenchmarkProjectController,
    BenchmarkDefinitionController,
  ],
  providers: [
    DatasetService,
    DvcService,
    MlflowClientService,
    BenchmarkProjectService,
    BenchmarkDefinitionService,
    EvaluatorRegistryService,
  ],
  exports: [
    DatasetService,
    DvcService,
    MlflowClientService,
    BenchmarkProjectService,
    BenchmarkDefinitionService,
    EvaluatorRegistryService,
  ],
})
export class BenchmarkModule {}
