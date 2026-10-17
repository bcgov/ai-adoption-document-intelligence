import { Module } from "@nestjs/common";
import { DatabaseModule } from "@/database/database.module";
import { DenoRunnerClient } from "./deno-runner.client";
import { DynamicNodeRepository } from "./dynamic-node.repository";
import { DynamicNodesController } from "./dynamic-nodes.controller";
import { DynamicNodesService } from "./dynamic-nodes.service";

/**
 * NestJS module wiring the Phase 6 dynamic-node CRUD surface.
 *
 * Composition:
 *  - `DynamicNodeRepository` — Prisma access for `DynamicNode` +
 *    `DynamicNodeVersion`.
 *  - `DenoRunnerClient` — typed HTTP client for the `deno-runner`
 *    sidecar (`/check`, `/health`, `/execute`).
 *  - `DynamicNodesService` — publish-time validation pipeline
 *    (parser → ts-check → allowlist → repo).
 *  - `DynamicNodesController` — five HTTP endpoints (POST/PUT/GET/list/DELETE).
 */
@Module({
  imports: [DatabaseModule],
  controllers: [DynamicNodesController],
  providers: [
    DynamicNodeRepository,
    {
      // Factory provider so Nest doesn't try to DI-resolve the constructor's
      // `options` object — the client picks up `DENO_RUNNER_URL` from env on
      // construction; tests instantiate `new DenoRunnerClient({ baseUrl, fetchImpl })`
      // directly without going through DI.
      provide: DenoRunnerClient,
      useFactory: () => new DenoRunnerClient(),
    },
    DynamicNodesService,
  ],
  exports: [DynamicNodeRepository, DynamicNodesService],
})
export class DynamicNodesModule {}
