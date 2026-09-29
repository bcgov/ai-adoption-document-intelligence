/**
 * `NoOutputNotice` — the single rendering of a `NoOutputReason` (G-012).
 *
 * Both preview surfaces (the node-card `PreviewWidget` and the wire
 * `WirePeekPopover`) route every "no output here" branch through this
 * component, so the copy for a given reason cannot differ between them.
 *
 * `evicted` is NOT rendered here: it is the only reason with a recovery
 * action, and that action (`CacheEvictedAlert`'s Re-run, which refetches the
 * historical `initialCtx` and POSTs a fresh run) belongs to the surface that
 * knows the workflow/run/node ids. Callers branch on `copy.offersRerun`.
 *
 * ## `failed` is the one reason drawn as an error
 *
 * Inderdeep, 2026-08-06: *"This error message is grayed out, should be similar
 * … with a red background. And if it failed, there is an action that the user
 * can take. Explanation, yes, but then there is an action … here there's
 * nothing. What do I do with this if it failed? What next?"* — and Alex:
 * *"why did it fail?"*
 *
 * Every reason used to render as the same grey box, so the only genuine
 * failure on the surface was dimmer than the (non-failure) cache-evicted
 * Alert beside it, said nothing about the cause, and offered no way forward.
 * `failed` now renders `StepFailedAlert`: red, carrying the engine's own
 * error text, and with a Re-run action. The other `notable` reasons stay grey
 * on purpose — "the run took a different branch" is a fact, not a fault, and
 * making everything red would put us back where we started.
 */

import {
  Alert,
  Anchor,
  Button,
  Group,
  Loader,
  Stack,
  Text,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useNodeId } from "@xyflow/react";
import { type ReactNode, useState } from "react";

import { useOptionalRunState } from "../run/RunStateContext";
import { fetchInputCtx, startRunWithCtx } from "./CacheEvictedAlert";
import { describeNoOutput, type NoOutputReason } from "./no-output-state";

export interface NoOutputNoticeProps {
  reason: NoOutputReason;
}

/**
 * Transient state of the Re-run action offered on a failed step.
 *   - `idle`      : button enabled.
 *   - `rerunning` : input-ctx fetch or `/tries` POST in flight.
 *   - `error`     : the re-run itself failed; the message is shown and the
 *                   button stays enabled so the user can try again.
 */
type RerunState = "idle" | "rerunning" | "error";

/**
 * I5, second half — the reviewer could not tell from the button whether
 * "Re-run workflow" retries the failed step or restarts everything, and the
 * code says unambiguously that it restarts everything: `onRerun` GETs the
 * run's original `initialCtx` and POSTs it to `POST /api/workflows/:id/tries`,
 * which calls `startGraphWorkflow` — a brand-new Temporal execution of the
 * whole graph from its entry node. There is no re-execute-one-step endpoint,
 * so "Try again" would have been the untrue label. The button keeps the
 * honest one and this line says what it costs, since a whole-workflow restart
 * is not what a reader assumes from a per-step error card.
 */
const RERUN_SCOPE_NOTE =
  "Runs the whole workflow again from the start, with the same input.";

/**
 * The failure surface: red Alert, the engine's own reason, and one action.
 *
 * **Where the "why" comes from.** The engine records the thrown error's
 * `.message` on `NodeRunStatus.errorMessage`, which `RunStateContext` already
 * holds for every node in the active run (it is what `NodeStatusBadge`'s
 * hover tooltip shows). This surface reads the same field, so the reason is
 * legible without hovering a 20px badge. It is the engine's text verbatim —
 * often terse ("Activity task failed") — and when the field is absent we say
 * so rather than inventing a cause.
 *
 * **How it knows which node it is.** React Flow puts the node id in context
 * for everything rendered inside a custom node, so on a node card
 * `useNodeId()` resolves without `PreviewWidget` having to thread a prop. The
 * wire-peek popover renders from an *edge*, where there is no node context —
 * there the alert keeps the red treatment and the Re-run action, and simply
 * omits the per-node reason line rather than guessing whose error it is.
 *
 * **What Re-run does, exactly.** The same thing `CacheEvictedAlert`'s button
 * does: refetch the run's original `initialCtx` and POST a fresh Try with it.
 * There is no re-execute-one-step endpoint, so the label says "workflow" —
 * the action must not read as if it retried the failed step alone, and
 * `RERUN_SCOPE_NOTE` now says it in the card as well as in this comment.
 *
 * **The action is recoverable, so it is not painted as destructive** (I5,
 * Inderdeep 2026-08-14: *"red button means a destructive action whereas
 * re-run workflow isn't destructive"*). The alert keeps the B.C. Design
 * System inline-alert danger treatment — tinted panel, 1px danger border,
 * danger icon, bold first line — because the step really did fail; the CTA
 * inside it is an outlined button, because re-running deletes nothing.
 */
export function StepFailedAlert(): ReactNode {
  const nodeId = useNodeId();
  const runState = useOptionalRunState();
  const [state, setState] = useState<RerunState>("idle");
  const [rerunError, setRerunError] = useState<string | null>(null);

  const workflowId = runState?.workflowId ?? "";
  const runId = runState?.activeRunId ?? null;
  const errorMessage =
    nodeId === null ? undefined : runState?.nodeStatuses[nodeId]?.errorMessage;

  // The Re-run needs a run to read the original input from. Outside a run
  // (a bare render, or a status map with no active run) there is nothing to
  // re-run, so the action is not offered rather than offered and broken.
  const canRerun = workflowId !== "" && runId !== null && runId !== "";

  const onRerun = async (): Promise<void> => {
    if (!canRerun || runState === null) return;
    setState("rerunning");
    setRerunError(null);
    try {
      const { initialCtx } = await fetchInputCtx(workflowId, runId);
      // G-024 — re-run the version being viewed, not head, exactly as the
      // cache-evicted recovery does.
      const result = await startRunWithCtx(
        workflowId,
        initialCtx,
        runState.replayVersion?.id,
      );
      runState.setActiveRunId(result.workflowId);
      runState.setIsReplay(false);
      setState("idle");
    } catch (err) {
      setRerunError(
        err instanceof Error ? err.message : "Failed to start re-run",
      );
      setState("error");
    }
  };

  return (
    <Alert
      color="red"
      variant="light"
      // I5 — the B.C. Design System inline alert is a tinted panel with a
      // 1px semantic border, not a tint alone. `--mantine-color-red-4` is
      // the BC danger red (#CE3E39) as mapped in `appTheme`, so the border
      // and the icon take the token rather than a pasted hex.
      bd="1px solid var(--mantine-color-red-4)"
      icon={<IconAlertCircle size={16} />}
      data-testid="no-output-failed"
      data-tone="error"
      data-rerun-state={state}
    >
      <Stack gap={6}>
        <Text size="xs" fw={700}>
          {describeNoOutput("failed").message}
        </Text>
        {nodeId !== null && (
          <Text size="xs" data-testid="step-failed-reason">
            {errorMessage !== undefined && errorMessage !== ""
              ? `Reason: ${errorMessage}`
              : "The engine reported no error detail for this step."}
          </Text>
        )}
        {state === "error" && rerunError !== null && (
          <Text size="xs" fw={600} data-testid="step-failed-rerun-error">
            {`Re-run failed: ${rerunError}`}
          </Text>
        )}
        {canRerun && (
          <>
            <Text size="xs" c="dimmed" data-testid="step-failed-rerun-scope">
              {RERUN_SCOPE_NOTE}
            </Text>
            <Group gap="xs" align="center" justify="flex-end">
              {state === "error" && (
                <Anchor
                  component="button"
                  type="button"
                  size="xs"
                  onClick={() => {
                    setState("idle");
                    setRerunError(null);
                  }}
                  data-testid="step-failed-rerun-dismiss"
                >
                  Dismiss
                </Anchor>
              )}
              <Button
                size="xs"
                // I5 — recoverable, therefore NOT destructive: an outlined
                // button on the alert's own surface, not a filled red one.
                variant="outline"
                color="red"
                bg="var(--mantine-color-body)"
                onClick={onRerun}
                disabled={state === "rerunning"}
                leftSection={
                  state === "rerunning" ? <Loader size="xs" /> : null
                }
                data-testid="step-failed-rerun"
              >
                Re-run workflow
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Alert>
  );
}

export function NoOutputNotice({ reason }: NoOutputNoticeProps): ReactNode {
  if (reason === "failed") {
    return <StepFailedAlert />;
  }
  const copy = describeNoOutput(reason);
  if (copy.tone === "silent") {
    // Nothing to say, but the caller's wrapper still carries `data-state` so
    // the state is observable rather than an indistinguishable blank card.
    return null;
  }
  if (copy.tone === "neutral") {
    return (
      <Text size="xs" c="dimmed" data-testid={`no-output-${reason}`}>
        {copy.message}
      </Text>
    );
  }
  return (
    <Alert color="gray" variant="light" data-testid={`no-output-${reason}`}>
      <Text size="xs">{copy.message}</Text>
    </Alert>
  );
}
