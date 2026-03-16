import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BlobStorageModule } from "@/blob-storage/blob-storage.module";
import { DatabaseModule } from "@/database/database.module";
import { DocumentModule } from "@/document/document.module";
import { OcrModule } from "@/ocr/ocr.module";
import { HitlModule } from "../hitl/hitl.module";
import { AuditLogService } from "./audit-log.service";
import { AuditLogDbService } from "./audit-log-db.service";
import { BenchmarkDefinitionController } from "./benchmark-definition.controller";
import { BenchmarkDefinitionService } from "./benchmark-definition.service";
import { BenchmarkDefinitionDbService } from "./benchmark-definition-db.service";
import { BenchmarkProjectController } from "./benchmark-project.controller";
import { BenchmarkProjectService } from "./benchmark-project.service";
import { BenchmarkProjectDbService } from "./benchmark-project-db.service";
import { BenchmarkRunController } from "./benchmark-run.controller";
import { BenchmarkRunService } from "./benchmark-run.service";
import { BenchmarkRunDbService } from "./benchmark-run-db.service";
import { BenchmarkTemporalService } from "./benchmark-temporal.service";
import { DatasetController } from "./dataset.controller";
import { DatasetService } from "./dataset.service";
import { DatasetDbService } from "./dataset-db.service";
import { EvaluatorRegistryService } from "./evaluator-registry.service";
import { GroundTruthGenerationController } from "./ground-truth-generation.controller";
import { GroundTruthGenerationService } from "./ground-truth-generation.service";
import { GroundTruthJobDbService } from "./ground-truth-job-db.service";
import { HitlDatasetController } from "./hitl-dataset.controller";
import { HitlDatasetService } from "./hitl-dataset.service";

@Module({
  imports: [
    ConfigModule,
    BlobStorageModule,
    DatabaseModule,
    DocumentModule,
    OcrModule,
    HitlModule,
  ],
  controllers: [
    DatasetController,
    HitlDatasetController,
    GroundTruthGenerationController,
    BenchmarkProjectController,
    BenchmarkDefinitionController,
    BenchmarkRunController,
  ],
  providers: [
    AuditLogDbService,
    BenchmarkProjectDbService,
    BenchmarkDefinitionDbService,
    BenchmarkRunDbService,
    DatasetDbService,
    GroundTruthJobDbService,
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
