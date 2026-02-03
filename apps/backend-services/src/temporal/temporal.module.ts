import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { WorkflowModule } from "../workflow/workflow.module";
import { TemporalClientService } from "./temporal-client.service";

@Module({
  imports: [ConfigModule, WorkflowModule],
  providers: [TemporalClientService],
  exports: [TemporalClientService],
})
export class TemporalModule {}
