import { ApplicationFailure } from "@temporalio/common";

/**
 * The failure an activity throws when it refuses another group's data. The
 * same input is refused on every attempt, so Temporal does not retry it.
 */
export function groupScopeViolation(message: string): ApplicationFailure {
  return ApplicationFailure.create({
    type: "GROUP_SCOPE_VIOLATION",
    message,
    nonRetryable: true,
  });
}
