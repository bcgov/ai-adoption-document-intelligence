import { z } from "zod/v4";

/**
 * Poll timing shared by the one-step Azure activities that wait for Azure to
 * finish internally (`azureOcr.analyze`, `azureClassify.analyze`).
 */
export const azurePollTimingShape = {
  pollIntervalSeconds: z.number().int().min(1).max(60).optional().meta({
    title: "Poll interval (seconds)",
    description: "How often to check whether Azure has finished.",
    "x-default": 10,
  }),
  maxWaitSeconds: z.number().int().min(30).max(3600).optional().meta({
    title: "Maximum wait (seconds)",
    description:
      "How long to wait for Azure before failing. Keep it under the node's step timeout (15 minutes by default).",
    "x-default": 600,
  }),
};

/** Step timeout for the one-step Azure activities, which include the wait. */
export const AZURE_ANALYZE_START_TO_CLOSE = "15m";
