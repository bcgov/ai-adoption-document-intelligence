import { TrainingStatus } from "@generated/client";
import { groupScopeViolation } from "../group-scope-violation";
import { getPrismaClient } from "./database-client";

/** Training job statuses that have not reached SUCCEEDED or FAILED. */
const IN_FLIGHT_TRAINING_STATUSES = [
  TrainingStatus.PENDING,
  TrainingStatus.UPLOADING,
  TrainingStatus.UPLOADED,
  TrainingStatus.TRAINING,
];

/**
 * Refuses an Azure Document Intelligence model that belongs to another group.
 *
 * Every group's trained models share one Azure resource. A model id belongs to
 * a group when one of the group's template models trained it, or has a
 * training job in flight that will produce it. Ids are compared without case:
 * every stored model id is lowercase, so the lowercased id is looked up
 * exactly, and `_` or `%` in an id never match other characters the way a
 * pattern match would. Any other id, such as an Azure prebuilt model, is not
 * group-owned. Nothing is skipped by name: a template's model id can start
 * with `prebuilt-` too.
 */
export async function assertModelUsableByGroup(
  modelId: string,
  groupId: string | null | undefined,
): Promise<void> {
  if (!groupId) {
    throw new Error(`groupId is required to use model ${modelId}`);
  }

  const prisma = getPrismaClient();
  const sameId = modelId.toLowerCase();
  const otherGroup = { group_id: { not: groupId } };
  const [trainedModel, trainingJob] = await Promise.all([
    prisma.trainedModel.findFirst({
      where: { model_id: sameId, template_model: otherGroup },
      select: { id: true },
    }),
    prisma.trainingJob.findFirst({
      where: {
        target_model_id: sameId,
        status: { in: IN_FLIGHT_TRAINING_STATUSES },
        template_model: otherGroup,
      },
      select: { id: true },
    }),
  ]);
  if (trainedModel || trainingJob) {
    throw groupScopeViolation(`Model not found: ${modelId}`);
  }
}
