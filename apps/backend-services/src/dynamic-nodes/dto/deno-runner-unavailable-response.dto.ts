import { ApiProperty } from "@nestjs/swagger";

/**
 * 503-response body for `POST` / `PUT` when the `deno-runner` sidecar cannot
 * type-check the submitted script.
 *
 * Two fields on purpose (D3): `message` is the sentence a person reads and
 * acts on, `details` is the diagnostic that used to BE the message — endpoint,
 * URL and underlying failure. Clients render `message` as the headline and
 * `details` as secondary text; the same diagnostic is also written to the
 * server log by `DenoRunnerClient`.
 */
export class DenoRunnerUnavailableResponseDto {
  @ApiProperty({
    description: "Stable machine-readable surface code for this failure.",
    example: "DENO_RUNNER_UNAVAILABLE",
    enum: ["DENO_RUNNER_UNAVAILABLE"],
  })
  code!: "DENO_RUNNER_UNAVAILABLE";

  @ApiProperty({
    description:
      "Human-facing explanation plus the action to take. Wording depends on where the runner is expected to live: a loopback URL yields the local start command, a deployed sidecar yields retry-then-escalate.",
    example:
      "The custom-node checker is not running, so this script could not be type-checked. Start it with `docker compose -f deployments/local/docker-compose.deno.yml up -d`, then publish again.",
  })
  message!: string;

  @ApiProperty({
    description:
      "Diagnostic detail for logs and support: the runner endpoint that was called and how it failed. Never the headline.",
    example:
      "POST http://localhost:9099/check could not be reached: fetch failed",
  })
  details!: string;
}
