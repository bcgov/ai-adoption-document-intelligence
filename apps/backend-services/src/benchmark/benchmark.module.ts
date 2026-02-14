import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BlobStorageModule } from "@/blob-storage/blob-storage.module";
import { BenchmarkArtifactService } from "./benchmark-artifact.service";
import { BenchmarkDefinitionController } from "./benchmark-definition.controller";
import { BenchmarkDefinitionService } from "./benchmark-definition.service";
import { BenchmarkProjectController } from "./benchmark-project.controller";
import { BenchmarkProjectService } from "./benchmark-project.service";
import { BenchmarkRunController } from "./benchmark-run.controller";
import { BenchmarkRunService } from "./benchmark-run.service";
import { BenchmarkTemporalService } from "./benchmark-temporal.service";
import { DatasetController } from "./dataset.controller";
import { DatasetService } from "./dataset.service";
import { DvcService } from "./dvc.service";
import { EvaluatorRegistryService } from "./evaluator-registry.service";
import { MLflowClientService } from "./mlflow-client.service";

@Module({
  imports: [ConfigModule, HttpModule, BlobStorageModule],
  controllers: [
    DatasetController,
    BenchmarkProjectController,
    BenchmarkDefinitionController,
    BenchmarkRunController,
  ],
  providers: [
    DatasetService,
    DvcService,
    MLflowClientService,
    BenchmarkProjectService,
    BenchmarkDefinitionService,
    BenchmarkRunService,
    BenchmarkTemporalService,
    EvaluatorRegistryService,
    BenchmarkArtifactService,
  ],
  exports: [
    DatasetService,
    DvcService,
    MLflowClientService,
    BenchmarkProjectService,
    BenchmarkDefinitionService,
    BenchmarkRunService,
    BenchmarkTemporalService,
    EvaluatorRegistryService,
    BenchmarkArtifactService,
  ],
})
export class BenchmarkModule {}
