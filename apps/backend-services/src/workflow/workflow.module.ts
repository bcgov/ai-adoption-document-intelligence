import { forwardRef, Module } from "@nestjs/common";
import { DatabaseModule } from "@/database/database.module";
import { TemporalModule } from "@/temporal/temporal.module";
import { WorkflowController } from "./workflow.controller";
import { WorkflowService } from "./workflow.service";

@Module({
  imports: [DatabaseModule, forwardRef(() => TemporalModule)],
  controllers: [WorkflowController],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
