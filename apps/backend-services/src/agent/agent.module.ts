import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "@/database/database.module";
import { DynamicNodesModule } from "@/dynamic-nodes/dynamic-nodes.module";
import { LoggingModule } from "@/logging/logging.module";
import { WorkflowModule } from "@/workflow/workflow.module";
import { AbortFlagMap } from "./abort-flag-map";
import { AgentController } from "./agent.controller";
import { AgentEnv } from "./agent.env";
import { AgentService } from "./agent.service";
import { ChatRepository } from "./chat.repository";
import { ProviderResolver } from "./provider-resolver";

/**
 * Phase 7 — AI workflow builder agent module.
 *
 * Wires:
 *  - `AgentEnv` — resolved env vars (provider keys + defaults).
 *  - `ProviderResolver` — provider+model → Vercel AI SDK `LanguageModel`.
 *  - `ChatRepository` — Prisma access for `ChatConversation` + `ChatMessage`.
 *  - `AgentService` — `streamText` orchestration + persistence.
 *  - `AgentController` — `POST /api/agent/chat` (Vercel UI message stream)
 *    + conversation CRUD endpoints.
 *
 * Depends on:
 *  - `WorkflowModule` for read/update of workflow lineages.
 *  - `DynamicNodesModule` for the merged activity catalog.
 *  - `DatabaseModule` for the Prisma client.
 *  - `LoggingModule` for structured logs.
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    LoggingModule,
    forwardRef(() => WorkflowModule),
    DynamicNodesModule,
  ],
  controllers: [AgentController],
  providers: [
    AbortFlagMap,
    AgentEnv,
    ProviderResolver,
    ChatRepository,
    AgentService,
  ],
  exports: [AgentService],
})
export class AgentModule {}
