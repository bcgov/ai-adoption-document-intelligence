import { Controller, Get } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Public } from "@/auth/public.decorator";

/** Response shape for the health endpoint. */
export interface HealthResponse {
  status: "ok";
}

/**
 * Exposes a liveness probe endpoint for container orchestration healthchecks.
 * Returns HTTP 200 as long as the application process is running.
 */
@ApiExcludeController()
@Controller("health")
export class HealthController {
  /**
   * Liveness probe used by Docker/Kubernetes healthchecks.
   *
   * @returns A simple status object indicating the service is alive.
   */
  @Public()
  @Get()
  check(): HealthResponse {
    return { status: "ok" };
  }
}
