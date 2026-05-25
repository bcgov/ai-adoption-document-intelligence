/**
 * `CacheEvictedAlert` — recovery UX rendered by `PreviewWidget` when the
 * preview-cache row for a *historical* run has been TTL-evicted (US-155).
 *
 * The user is replaying an old run and would otherwise be staring at an
 * empty preview pane. This Alert calls that out explicitly and offers a
 * Re-run button that:
 *   1. fetches the original run's `initialCtx` from
 *      `GET /api/workflows/:id/runs/:runId/input-ctx` (US-151);
 *   2. starts a fresh Try via `POST /api/workflows/:id/runs` with the
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
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L42
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-155-cache-evicted-preview-and-rerun.md
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §6.4
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
import { type ReactNode, useState } from "react";

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
 * Wire shape returned by `POST /api/workflows/:id/runs`. Mirrors the
 * backend's `StartRunResponse` DTO; locally typed here so this module
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
 * Pulls the CSRF token from the `csrf_token` cookie. Mirrors the helper
 * in `api.service.ts` so this component stays decoupled from axios.
 */
function readCsrfToken(): string | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrf_token="));
  return match?.split("=")[1];
}

/**
 * Builds the headers shared by both the GET `input-ctx` request and the
 * POST `/runs` request. The CSRF token is included unconditionally; the
 * backend's CSRF guard ignores it on GET but requires it on POST.
 */
function buildAuthHeaders(method: "GET" | "POST"): HeadersInit {
  const headers: Record<string, string> = {};
  if (method === "POST") {
    headers["Content-Type"] = "application/json";
  }
  const testApiKey = import.meta.env.VITE_TEST_API_KEY;
  if (typeof testApiKey === "string" && testApiKey.length > 0) {
    headers["x-api-key"] = testApiKey;
  }
  const csrfToken = readCsrfToken();
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  return headers;
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
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: buildAuthHeaders("GET"),
  });

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
 * Starts a fresh Try via `POST /api/workflows/:id/runs` with the supplied
 * `initialCtx`. Exported so unit tests can stub the network surface.
 */
export async function startRunWithCtx(
  workflowId: string,
  initialCtx: Record<string, unknown>,
): Promise<StartRunResponseBody> {
  const url = `${API_BASE_URL}/workflows/${workflowId}/runs`;
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: buildAuthHeaders("POST"),
    body: JSON.stringify({ initialCtx }),
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
 *   - `rerunning`         : input-ctx fetch in flight OR `/runs` POST
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
  const { setActiveRunId, setIsReplay } = useRunState();
  const [mode, setMode] = useState<Mode>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onRerun = async (): Promise<void> => {
    setMode("rerunning");
    setErrorMessage(null);
    try {
      const { initialCtx } = await fetchInputCtx(workflowId, runId);
      const result = await startRunWithCtx(workflowId, initialCtx);
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

  const alertText = ((): string => {
    switch (mode) {
      case "rerunning":
        return "Re-running...";
      case "retention-cleaned":
        return "Re-run unavailable — historical input has been retention-cleaned";
      case "error":
        return errorMessage ?? "Re-run failed";
      case "idle":
        return "Preview unavailable — cache evicted. Re-run to repopulate.";
    }
  })();

  const buttonDisabled = mode === "rerunning" || mode === "retention-cleaned";

  return (
    <Alert
      color="red"
      variant="light"
      icon={<IconAlertCircle size={16} />}
      data-testid={`cache-evicted-alert-${nodeId}`}
      data-mode={mode}
    >
      <Stack gap="xs">
        <Text size="sm" data-testid={`cache-evicted-alert-text-${nodeId}`}>
          {alertText}
        </Text>
        <Group gap="xs" align="center">
          <Button
            size="xs"
            variant="filled"
            color="red"
            onClick={onRerun}
            disabled={buttonDisabled}
            leftSection={
              mode === "rerunning" ? <Loader size="xs" color="white" /> : null
            }
            data-testid={`cache-evicted-rerun-${nodeId}`}
          >
            Re-run
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
