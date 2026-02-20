import { HttpModule } from "@nestjs/axios";
import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BlobStorageModule } from "@/blob-storage/blob-storage.module";
import { AuditLogService } from "./audit-log.service";
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
import { FieldAccuracyEvaluator } from "./evaluators/field-accuracy.evaluator";
import { SchemaAwareEvaluator } from "./evaluators/schema-aware.evaluator";
import { BlackBoxEvaluator } from "./evaluators/black-box.evaluator";

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
    AuditLogService,
    FieldAccuracyEvaluator,
    SchemaAwareEvaluator,
    BlackBoxEvaluator,
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
    AuditLogService,
  ],
})
export class BenchmarkModule implements OnModuleInit {
  constructor(
    private readonly evaluatorRegistry: EvaluatorRegistryService,
    private readonly fieldAccuracyEvaluator: FieldAccuracyEvaluator,
    private readonly schemaAwareEvaluator: SchemaAwareEvaluator,
    private readonly blackBoxEvaluator: BlackBoxEvaluator,
  ) {}

  onModuleInit() {
    // Register evaluators on module initialization
    this.evaluatorRegistry.register(this.fieldAccuracyEvaluator);
    this.evaluatorRegistry.register(this.schemaAwareEvaluator);
    this.evaluatorRegistry.register(this.blackBoxEvaluator);
  }
}
