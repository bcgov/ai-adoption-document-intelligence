import {
  AzureClassifyInProgressError,
  type AzureClassifyPollOutput,
  azureClassifyPoll,
} from "./azure-classify-poll";
import {
  type AzureClassifySubmitInput,
  azureClassifySubmit,
} from "./azure-classify-submit";
import { pollUntilSettled } from "./azure-poll-loop";

export interface AnalyzeWithAzureClassifierInput
  extends AzureClassifySubmitInput {
  pollIntervalSeconds?: number;
  maxWaitSeconds?: number;
}

/**
 * Activity: Classify a document with an Azure classifier in one step.
 *
 * Runs `azureClassify.submit`, then `azureClassify.poll` until Azure has
 * finished, and returns the labelled page ranges. The granular activities stay
 * registered, so existing workflows are unaffected.
 *
 * @param input - Document, group and classifier name, plus optional poll timing.
 * @returns Detected documents grouped by classifier label.
 */
export async function analyzeWithAzureClassifier(
  input: AnalyzeWithAzureClassifierInput,
): Promise<AzureClassifyPollOutput> {
  const { pollIntervalSeconds, maxWaitSeconds, ...submitInput } = input;
  const submitted = await azureClassifySubmit(submitInput);

  return pollUntilSettled<AzureClassifyPollOutput>(
    async () => {
      try {
        return { done: true, value: await azureClassifyPoll(submitted) };
      } catch (error) {
        if (error instanceof AzureClassifyInProgressError) {
          return { done: false };
        }
        throw error;
      }
    },
    {
      pollIntervalSeconds,
      maxWaitSeconds,
      description: "Azure classifier to finish",
    },
  );
}
