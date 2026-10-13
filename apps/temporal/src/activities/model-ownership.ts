import { ApplicationFailure } from "@temporalio/common";
import { getPrismaClient } from "./database-client";

/**
 * Refuses an Azure Document Intelligence model that another group trained.
 *
 * Every group's trained models share one Azure resource, so the run's group
 * must own a trained model before the run can analyse with it. Prebuilt
 * models (`prebuilt-*`) are shared by every group, and an id that no trained
 * model records is not group-owned.
 */
export async function assertModelUsableByGroup(
  modelId: string,
  groupId: string | null | undefined,
): Promise<void> {
  if (modelId.startsWith("prebuilt-")) {
    return;
  }
  if (!groupId) {
    throw new Error(`groupId is required to use model ${modelId}`);
  }

  const trainedModel = await getPrismaClient().trainedModel.findUnique({
    where: { model_id: modelId },
    select: { template_model: { select: { group_id: true } } },
  });
  if (trainedModel && trainedModel.template_model.group_id !== groupId) {
    throw ApplicationFailure.create({
      type: "GROUP_SCOPE_VIOLATION",
      message: `Model not found: ${modelId}`,
      nonRetryable: true,
    });
  }
}
