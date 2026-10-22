/**
 * `CacheEvictedAlert` — recovery UX rendered by `PreviewWidget` when the
 * preview-cache row for a *historical* run has been TTL-evicted (US-155).
 *
 * The user is replaying an old run and would otherwise be staring at an
 * empty preview pane. This Alert calls that out explicitly and offers a
 * Re-run button that:
 *   1. fetches the original run's `initialCtx` from
 *      `GET /api/workflows/:id/runs/:runId/input-ctx` (US-151);
 *   2. starts a fresh Try via `POST /api/workflows/:id/tries` with the
 *      historical `initialCtx`;
 *   3. swaps the editor out of replay mode into the new live run via the
 *      `RunStateContext` setters (`setActiveRunId` + `setIsReplay(false)`).
 *
 * Error handling mirrors the input-ctx endpoint's contract: a 404 (the
 * historical run is past Temporal retention AND no source-node cache row
 * remains) surfaces a dedicated "retention-cleaned" Alert variant with
 * the Re-run button disabled. The user can dismiss the error state via a
 * Close link to fall back to the standard evicted-cache Alert.
 *
 * **A missing preview is not a failed step.** This Alert is only ever rendered
 * for a node whose run status is `succeeded` or `skipped` (see
 * `noOutputReasonForNode`), and the same card carries a green check, so a red
 * treatment would contradict it. The idle (and in-flight) presentation is
 * therefore NEUTRAL — a grey Alert with a "no stored data" icon — and leads
 * with the step's verdict before saying what is missing. Red is reserved for
 * a re-run that failed; a re-run that cannot be offered at all is a warning.
 * See `MODE_PRESENTATION` below.
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L42
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-155-cache-evicted-preview-and-rerun.md
 *   - docs-md/workflows/TRY_IN_PLACE_DESIGN.md §6.4
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
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconDatabaseOff,
} from "@tabler/icons-react";
import { type ComponentType, type ReactNode, useState } from "react";

import { builderFetch } from "../../../data/services/builder-fetch";
import { API_BASE_URL } from "../../../shared/constants";
import { useRunState } from "../run/RunStateContext";
import { ApiError } from "../sources/useSourceUpload";

/**
 * Re-exported so consumer tests + sibling hooks can `instanceof`-check.
 * Mirrors the re-export pattern used by `useNodeStatuses` /
 * `useActivityOutputPreview`.
 */
export { ApiError } from "../sources/useSourceUpload";

interface ErrorResponseBody {
  message?: string | string[];
}

/**
 * Wire shape returned by `GET /api/workflows/:id/runs/:runId/input-ctx`.
 * Mirrors the backend's `InputCtxResponseDto`.
 */
export interface InputCtxResponse {
  initialCtx: Record<string, unknown>;
}

/**
 * Wire shape returned by `POST /api/workflows/:id/tries`. Mirrors the
 * backend's `StartTryResponseDto`; locally typed here so this module
 * stays independent of `data/hooks/useWorkflows.ts` (which uses axios via
 * `apiService` — we use inline `fetch` for symmetry with the sibling
 * Phase 4 hooks and so we can branch on HTTP status code).
 */
export interface StartRunResponseBody {
  workflowId: string;
  workflowVersionId: string;
  status: "started";
}

/**
 * Extracts the human-friendly `message` field from an error response
 * body. Falls back to `response.statusText` when the body isn't JSON or
 * carries no `message`. Identical helper to the one in
 * `useActivityOutputPreview` / `useNodeStatuses` — duplicated rather
 * than shared because each sibling hook keeps the same shape.
 */
async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  let message = response.statusText || fallback;
  try {
    const body = (await response.json()) as ErrorResponseBody;
    const raw = body?.message;
    if (typeof raw === "string" && raw.length > 0) {
      message = raw;
    } else if (Array.isArray(raw)) {
      message = raw.join(", ");
    }
  } catch {
    // Body wasn't JSON — fall back to statusText.
  }
  return message;
}

/**
 * Fetches the historical `initialCtx` for the run that produced the
 * (now-evicted) cache row. Throws `ApiError(404)` when the run is past
 * retention; throws `ApiError(403)` for cross-lineage `runId`s.
 *
 * Exported so unit tests can stub it without touching `globalThis.fetch`.
 */
export async function fetchInputCtx(
  workflowId: string,
  runId: string,
): Promise<InputCtxResponse> {
  const url = `${API_BASE_URL}/workflows/${workflowId}/runs/${runId}/input-ctx`;
  const response = await builderFetch(url, { method: "GET" });

  if (!response.ok) {
    const message = await readErrorMessage(
      response,
      "Failed to fetch historical input",
    );
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as InputCtxResponse;
}

/**
 * Starts a fresh Try via `POST /api/workflows/:id/tries` with the supplied
 * `initialCtx`. Exported so unit tests can stub the network surface.
 *
 * `/tries`, not `/runs`. Re-running to repopulate an evicted preview row is
 * canvas iteration, not a production run: it must be stamped
 * `RunTrigger = "try"` so the next Try can cancel it, and so it doesn't read
 * as a production execution in run history.
 *
 * `workflowVersionId` targets the version the user is LOOKING AT. Without it
 * the backend defaults to head, so a re-run offered while replaying an old run
 * would execute a different graph and file the result in history as if it
 * were the same thing. Absent only when not replaying, where head is the
 * correct target.
 */
export async function startRunWithCtx(
  workflowId: string,
  initialCtx: Record<string, unknown>,
  workflowVersionId?: string,
): Promise<StartRunResponseBody> {
  const url = `${API_BASE_URL}/workflows/${workflowId}/tries`;
  const response = await builderFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      workflowVersionId ? { initialCtx, workflowVersionId } : { initialCtx },
    ),
  });

  if (!response.ok) {
    const message = await readErrorMessage(
      response,
      "Failed to start workflow run",
    );
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as StartRunResponseBody;
}

/**
 * What Re-run does, said next to the button: here and on a failed step's
 * card (`StepFailedAlert`). Both fetch the run's original input and start a
 * new Try with it, which runs the whole graph from its entry step; no endpoint
 * re-runs one step. The button sits on one step's card, where a reader would
 * not assume a whole-workflow restart, so the cost is stated.
 */
export const RERUN_SCOPE_NOTE =
  "Runs the whole workflow again from the start, with the same input.";

/**
 * Colour of that line. The theme's `gray.7` (#605E5C) is 5.4:1 on the red
 * alerts' tint and 5.9:1 on the grey one; `dimmed` (`gray.6`, #9F9D9C) is
 * 2.3–2.5:1 on them, below the 4.5:1 that text this small needs.
 */
export const RERUN_SCOPE_COLOR = "gray.7";

export interface CacheEvictedAlertProps {
  /** Lineage id of the workflow whose preview-cache row was evicted. */
  workflowId: string;
  /**
   * Temporal workflow execution id of the historical run the user is
   * replaying. The Re-run handler fetches this run's `initialCtx`.
   */
  runId: string;
  /**
   * Node id whose preview row is missing. Surfaced via the test-id for
   * targeted assertions; not used by the click handler today (the input
   * ctx is per-run, not per-node).
   */
  nodeId: string;
}

/**
 * Internal mode tracking the Alert's transient UI state:
 *   - `idle`              : default — Re-run button is enabled.
 *   - `rerunning`         : input-ctx fetch in flight OR `/tries` POST
 *                           in flight. Button shows `<Loader>` + is
 *                           disabled; Alert text reads "Re-running...".
 *   - `retention-cleaned` : the input-ctx endpoint returned 404 (the
 *                           run is past Temporal retention AND no
 *                           source-node cache row remains). Button is
 *                           disabled; Alert exposes a "Close" link that
 *                           returns to `idle`.
 *   - `error`             : non-404 error (5xx / 403). Button remains
 *                           enabled; the Alert shows the error message
 *                           so the user can retry.
 */
type Mode = "idle" | "rerunning" | "retention-cleaned" | "error";

/**
 * How each mode is drawn. `tone` is exposed on the Alert as `data-tone` so a
 * spec can assert "a succeeded node's evicted preview is NOT drawn as an
 * error" without reaching into Mantine's class names.
 *
 *   - `neutral` — the step is fine, we simply do not hold its preview. Grey,
 *     with a "no stored data" icon and an unstyled button, so it agrees with
 *     the node's green check badge.
 *   - `error`   — the re-run itself failed. Red, and the button stays enabled
 *     so the user can try again.
 *   - `warning` — the historical input is gone, so no recovery can be
 *     offered. Not a failure of the step, so not red.
 */
interface ModePresentation {
  tone: "neutral" | "warning" | "error";
  color: string;
  Icon: ComponentType<{ size?: number }>;
  buttonVariant: "default" | "outline";
  buttonColor: string | undefined;
}

const MODE_PRESENTATION: Record<Mode, ModePresentation> = {
  idle: {
    tone: "neutral",
    color: "gray",
    Icon: IconDatabaseOff,
    buttonVariant: "default",
    buttonColor: undefined,
  },
  rerunning: {
    tone: "neutral",
    color: "gray",
    Icon: IconDatabaseOff,
    buttonVariant: "default",
    buttonColor: undefined,
  },
  "retention-cleaned": {
    tone: "warning",
    color: "yellow",
    Icon: IconAlertTriangle,
    buttonVariant: "default",
    buttonColor: undefined,
  },
  error: {
    tone: "error",
    // The panel stays red because the re-run really did fail, but the button
    // that retries it is outlined, not filled: filled red is this UI's
    // destructive-action treatment, and re-running destroys nothing. The
    // `StepFailedAlert` CTA in `NoOutputNotice` is drawn the same way.
    color: "red",
    Icon: IconAlertCircle,
    buttonVariant: "outline",
    buttonColor: "red",
  },
};

/**
 * Cache-evicted recovery Alert. Owns its own transient state for the
 * loading + error flows — the parent `PreviewWidget` only routes to this
 * component when the preview-cache hook returns `data === null` with a
 * `runId` set, and never needs to inspect the Re-run progress.
 */
export function CacheEvictedAlert({
  workflowId,
  runId,
  nodeId,
}: CacheEvictedAlertProps): ReactNode {
  const { replayVersion, setActiveRunId, setIsReplay } = useRunState();
  const [mode, setMode] = useState<Mode>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onRerun = async (): Promise<void> => {
    setMode("rerunning");
    setErrorMessage(null);
    try {
      const { initialCtx } = await fetchInputCtx(workflowId, runId);
      // Re-run THE VERSION BEING VIEWED. `replayVersion` is the version the
      // replay is pinned to; without it this POST defaults to head, which can
      // be a different graph from the one on screen.
      const result = await startRunWithCtx(
        workflowId,
        initialCtx,
        replayVersion?.id,
      );
      // Swap the editor out of replay mode into the new live run. The
      // `setIsReplay(false)` call closes the top-bar's "Replay mode"
      // indicator (driven by `RunStateContext.isReplay`).
      setActiveRunId(result.workflowId);
      setIsReplay(false);
      setMode("idle");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setMode("retention-cleaned");
        return;
      }
      const message =
        err instanceof Error ? err.message : "Failed to start re-run";
      setErrorMessage(message);
      setMode("error");
    }
  };

  const onClose = (): void => {
    setMode("idle");
    setErrorMessage(null);
  };

  const versionLabel = replayVersion ? `v${replayVersion.versionNumber}` : null;

  const alertText = ((): string => {
    switch (mode) {
      case "rerunning":
        return versionLabel ? `Re-running ${versionLabel}...` : "Re-running...";
      case "retention-cleaned":
        return "Re-run unavailable — historical input has been retention-cleaned";
      case "error":
        return errorMessage ?? "Re-run failed";
      case "idle":
        // Lead with the step's verdict: this Alert only renders for a node
        // that succeeded (or was served from cache), so saying only
        // "unavailable" would read as a second, contradictory failure verdict
        // next to the green check. Name the re-run target too, so the user is
        // not guessing which graph runs.
        return versionLabel
          ? `This step completed. Preview unavailable — its output isn't in the preview cache. Re-run ${versionLabel} (the version you are viewing) to see it.`
          : "This step completed. Preview unavailable — its output isn't in the preview cache. Re-run to see it.";
    }
  })();

  const buttonDisabled = mode === "rerunning" || mode === "retention-cleaned";
  const presentation = MODE_PRESENTATION[mode];

  return (
    <Alert
      color={presentation.color}
      variant="light"
      icon={<presentation.Icon size={16} />}
      data-testid={`cache-evicted-alert-${nodeId}`}
      data-mode={mode}
      data-tone={presentation.tone}
    >
      <Stack gap="xs">
        <Text size="sm" data-testid={`cache-evicted-alert-text-${nodeId}`}>
          {alertText}
        </Text>
        {mode !== "retention-cleaned" && (
          <Text
            size="xs"
            c={RERUN_SCOPE_COLOR}
            data-testid={`cache-evicted-rerun-scope-${nodeId}`}
          >
            {RERUN_SCOPE_NOTE}
          </Text>
        )}
        <Group gap="xs" align="center">
          <Button
            size="xs"
            variant={presentation.buttonVariant}
            color={presentation.buttonColor}
            onClick={onRerun}
            disabled={buttonDisabled}
            // No `color` on the Loader: the button is an unstyled
            // `variant="default"` in `rerunning`, where a white spinner would
            // be invisible against its light background.
            leftSection={mode === "rerunning" ? <Loader size="xs" /> : null}
            data-testid={`cache-evicted-rerun-${nodeId}`}
            data-version-id={replayVersion?.id ?? ""}
          >
            {versionLabel ? `Re-run ${versionLabel}` : "Re-run"}
          </Button>
          {mode === "retention-cleaned" && (
            <Anchor
              component="button"
              type="button"
              size="xs"
              onClick={onClose}
              data-testid={`cache-evicted-close-${nodeId}`}
            >
              Close
            </Anchor>
          )}
        </Group>
      </Stack>
    </Alert>
  );
}
