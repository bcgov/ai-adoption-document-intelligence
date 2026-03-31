import { HttpModule } from "@nestjs/axios";
import { forwardRef, Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BlobStorageModule } from "@/blob-storage/blob-storage.module";
import { DatabaseModule } from "@/database/database.module";
import { DocumentModule } from "@/document/document.module";
import { HitlModule } from "@/hitl/hitl.module";
import { OcrModule } from "@/ocr/ocr.module";
import { WorkflowModule } from "@/workflow/workflow.module";
import { AiRecommendationService } from "./ai-recommendation.service";
import { AuditLogDbService } from "./audit-log-db.service";
import { AuditLogService } from "./audit-log.service";
import { BenchmarkDefinitionController } from "./benchmark-definition.controller";
import { BenchmarkDefinitionDbService } from "./benchmark-definition-db.service";
import { BenchmarkDefinitionService } from "./benchmark-definition.service";
import { BenchmarkProjectController } from "./benchmark-project.controller";
import { BenchmarkProjectDbService } from "./benchmark-project-db.service";
import { BenchmarkProjectService } from "./benchmark-project.service";
import { BenchmarkRunController } from "./benchmark-run.controller";
import { BenchmarkRunDbService } from "./benchmark-run-db.service";
import { BenchmarkRunService } from "./benchmark-run.service";
import { BenchmarkTemporalService } from "./benchmark-temporal.service";
import { ConfusionMatrixController } from "./confusion-matrix.controller";
import { ConfusionMatrixService } from "./confusion-matrix.service";
import { DatasetDbService } from "./dataset-db.service";
import { DatasetController } from "./dataset.controller";
import { DatasetService } from "./dataset.service";
import { EvaluatorRegistryService } from "./evaluator-registry.service";
import { GroundTruthGenerationController } from "./ground-truth-generation.controller";
import { GroundTruthGenerationService } from "./ground-truth-generation.service";
import { GroundTruthJobDbService } from "./ground-truth-job-db.service";
import { HitlDatasetController } from "./hitl-dataset.controller";
import { HitlDatasetService } from "./hitl-dataset.service";
import { OcrImprovementPipelineService } from "./ocr-improvement-pipeline.service";

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    BlobStorageModule,
    DatabaseModule,
    DocumentModule,
    OcrModule,
    forwardRef(() => HitlModule),
    forwardRef(() => WorkflowModule),
  ],
  controllers: [
    DatasetController,
    HitlDatasetController,
    GroundTruthGenerationController,
    BenchmarkProjectController,
    BenchmarkDefinitionController,
    BenchmarkRunController,
    ConfusionMatrixController,
  ],
  providers: [
    DatasetDbService,
    DatasetService,
    HitlDatasetService,
    GroundTruthJobDbService,
    GroundTruthGenerationService,
    BenchmarkProjectDbService,
    BenchmarkProjectService,
    BenchmarkDefinitionDbService,
    BenchmarkDefinitionService,
    BenchmarkRunDbService,
    BenchmarkRunService,
    BenchmarkTemporalService,
    EvaluatorRegistryService,
    AuditLogDbService,
    AuditLogService,
    ConfusionMatrixService,
    AiRecommendationService,
    OcrImprovementPipelineService,
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
    ConfusionMatrixService,
    AiRecommendationService,
    OcrImprovementPipelineService,
  ],
})
export class BenchmarkModule implements OnModuleInit {
  constructor(private readonly evaluatorRegistry: EvaluatorRegistryService) {}

  onModuleInit() {
    this.evaluatorRegistry.registerType("schema-aware");
    this.evaluatorRegistry.registerType("black-box");
    this.evaluatorRegistry.registerType("ocr-correction");
  }
}
