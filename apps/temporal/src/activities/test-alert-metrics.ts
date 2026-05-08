/**
 * Activity: Test alert metrics by emitting logs with alertType.
 *
 * This activity exists solely to verify that the Prometheus alert pipeline
 * works end-to-end. It should be removed once the pipeline has been validated.
 *
 * - shouldFail=true  → logs error with alertType → increments app_error_total
 * - shouldFail=false → logs info  with alertType → increments app_success_total
 */

import { createActivityLogger } from "../logger";

export interface TestAlertMetricsParams {
  shouldFail: boolean;
}

export async function testAlertMetrics(
  params: TestAlertMetricsParams,
): Promise<{ ok: boolean }> {
  const log = createActivityLogger("testAlertMetrics", {});

  if (params.shouldFail) {
    log.error("Test alert: simulated failure", {
      event: "test_failure",
      alertType: "temporal_test",
    });
    throw new Error("Simulated failure for alert testing");
  }

  log.info("Test alert: simulated success", {
    event: "test_success",
    alertType: "temporal_test",
  });

  return { ok: true };
}
