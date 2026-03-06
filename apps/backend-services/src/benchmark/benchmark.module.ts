import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BlobStorageModule } from "@/blob-storage/blob-storage.module";
import { DatabaseModule } from "@/database/database.module";
import { OcrModule } from "@/ocr/ocr.module";
import { AuditLogService } from "./audit-log.service";
import { BenchmarkDefinitionController } from "./benchmark-definition.controller";
import { BenchmarkDefinitionService } from "./benchmark-definition.service";
import { BenchmarkProjectController } from "./benchmark-project.controller";
import { BenchmarkProjectService } from "./benchmark-project.service";
import { BenchmarkRunController } from "./benchmark-run.controller";
import { BenchmarkRunService } from "./benchmark-run.service";
import { BenchmarkTemporalService } from "./benchmark-temporal.service";
import { DatasetController } from "./dataset.controller";
import { DatasetService } from "./dataset.service";
import { EvaluatorRegistryService } from "./evaluator-registry.service";
import { GroundTruthGenerationController } from "./ground-truth-generation.controller";
import { GroundTruthGenerationService } from "./ground-truth-generation.service";
import { HitlDatasetController } from "./hitl-dataset.controller";
import { HitlDatasetService } from "./hitl-dataset.service";

@Module({
  imports: [ConfigModule, BlobStorageModule, DatabaseModule, OcrModule],
  controllers: [
    DatasetController,
    HitlDatasetController,
    GroundTruthGenerationController,
    BenchmarkProjectController,
    BenchmarkDefinitionController,
    BenchmarkRunController,
  ],
  providers: [
    DatasetService,
    HitlDatasetService,
    GroundTruthGenerationService,
    BenchmarkProjectService,
    BenchmarkDefinitionService,
    BenchmarkRunService,
    BenchmarkTemporalService,
    EvaluatorRegistryService,
    AuditLogService,
  ],
  exports: [
    DatasetService,
    HitlDatasetService,
    GroundTruthGenerationService,
    BenchmarkProjectService,
    BenchmarkDefinitionService,
    BenchmarkRunService,
    BenchmarkTemporalService,
    EvaluatorRegistryService,
    AuditLogService,
  ],
})
export class BenchmarkModule implements OnModuleInit {
  constructor(private readonly evaluatorRegistry: EvaluatorRegistryService) {}

  onModuleInit() {
    this.evaluatorRegistry.registerType("schema-aware");
    this.evaluatorRegistry.registerType("black-box");
  }
}
