/**
 * `SourceUploadButton` — "Upload & Try" affordance rendered below the
 * parameters form on the `source.upload` node-settings panel (Phase 8
 * US-124, extended in Phase 4 US-147).
 *
 * Wraps a hidden `<input type="file">` whose `accept` is built from the
 * source node's resolved `allowedMimeTypes`. On click the button
 * programmatically focuses the hidden input; selecting a file invokes
 * `useSourceUpload(workflowId, sourceNodeId).mutateAsync(file)`
 * (US-122).
 *
 * Phase 4 US-147 makes upload the Try trigger for `source.upload`
 * workflows: on a successful upload the response (US-146) carries
 * `runId` + `workflowVersionId`, and this button writes `runId` into
 * `RunStateContext` (US-138) so the canvas's status polling loop kicks
 * in. The button keeps the existing settings-panel success surface
 * (green Alert + CopyButton) — the canvas wiring is additive.
 *
 * Surfaces:
 *  - In-flight: `<Loader size="xs" />` swap + disabled state.
 *  - 2xx: green `<Alert>` with each `ctxKey → URL` pair shown via a
 *    `<Code>` block + a `CopyButton`, plus a Mantine notification.
 *    `runId` / `workflowVersionId` are NOT rendered in the Alert —
 *    they're wiring metadata, not ctx values for the user to copy.
 *  - 4xx (400 / 413): red `<Alert>` carrying the backend's error
 *    message and the HTTP status; button re-enables for retry.
 *    `activeRunId` is NOT modified on failure (US-147 Scenario 5).
 *  - Create mode (no `workflowId` yet): button is disabled inside a
 *    "Save the workflow first" tooltip — mirrors the Phase 2 Track 3
 *    History button precedent in `WorkflowEditorV2Page.tsx`.
 */

import {
  Alert,
  Button,
  Code,
  CopyButton,
  Group,
  Loader,
  Stack,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconCopy, IconUpload } from "@tabler/icons-react";
import { useRef, useState } from "react";

import { useOptionalRunState } from "../run/RunStateContext";

import {
  ApiError,
  type SourceUploadResponse,
  useSourceUpload,
} from "./useSourceUpload";

/**
 * Wire fields the success Alert deliberately omits — `runId` and
 * `workflowVersionId` are Phase 4 (US-146) wiring metadata fed into
 * canvas state, not ctxKey → URL pairs for the user to copy.
 */
const RESERVED_RESPONSE_FIELDS: ReadonlySet<string> = new Set([
  "runId",
  "workflowVersionId",
]);

export interface SourceUploadButtonProps {
  /**
   * Lineage id of the workflow being edited. `undefined` in create
   * mode — surfaces as a disabled button with a "Save the workflow
   * first" tooltip (Scenario 5).
   */
  workflowId?: string;
  /** Id of the `source.upload` node whose settings panel hosts the button. */
  sourceNodeId: string;
  /**
   * Resolved (with defaults filled in) MIME glob list used to build
   * the file picker's `accept` attribute. Glob entries like
   * `"image/*"` are handled natively by the browser.
   */
  allowedMimeTypes: string[];
}

interface SuccessState {
  data: SourceUploadResponse;
}

interface ErrorState {
  status: number | null;
  message: string;
}

export function SourceUploadButton({
  workflowId,
  sourceNodeId,
  allowedMimeTypes,
}: SourceUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [result, setResult] = useState<SuccessState | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);

  // The hook still requires positional `workflowId` + `sourceNodeId`
  // to satisfy the rules-of-hooks contract; we gate `mutateAsync`
  // behind the `isCreateMode` check below so the empty-string id is
  // never actually used at the wire.
  const upload = useSourceUpload(workflowId ?? "", sourceNodeId);

  // US-147: pull the `setActiveRunId` setter from `RunStateContext`
  // (US-138). Soft-fail outside a provider so this button can still be
  // exercised in isolation by SourceNodeSettings tests etc. — only the
  // canvas wiring is skipped in that case.
  const runState = useOptionalRunState();

  const isCreateMode = !workflowId;

  const handlePick = () => {
    setError(null);
    inputRef.current?.click();
  };

  const handleFile = async (file: File) => {
    setResult(null);
    setError(null);
    try {
      const data = await upload.mutateAsync(file);
      setResult({ data });
      // US-147 Scenario 2: feed the new run id into canvas state so
      // `useNodeStatuses` (US-137) starts polling on it.
      runState?.setActiveRunId(data.runId);
      notifications.show({
        title: "Upload & Try succeeded",
        message: "Workflow can now use this URL via the Run drawer.",
        color: "green",
      });
    } catch (err) {
      // US-147 Scenario 5: `activeRunId` MUST NOT change on failure.
      // The setter call lives in the success branch only.
      if (err instanceof ApiError) {
        setError({ status: err.status, message: err.message });
        return;
      }
      const message = err instanceof Error ? err.message : "Upload failed";
      setError({ status: null, message });
    }
  };

  if (isCreateMode) {
    return (
      <Tooltip label="Save the workflow first" withArrow>
        <Button
          leftSection={<IconUpload size={16} />}
          disabled
          variant="light"
          data-testid="source-upload-button"
        >
          Upload &amp; Try
        </Button>
      </Tooltip>
    );
  }

  const pending = upload.isPending;

  return (
    <Stack gap="xs" data-testid="source-upload-button-section">
      <input
        ref={inputRef}
        type="file"
        accept={allowedMimeTypes.join(",")}
        style={{ display: "none" }}
        data-testid="source-upload-button-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset the value so the same file can be re-picked
          // immediately after a 4xx retry without forcing the user
          // to pick a different file first.
          event.target.value = "";
          if (file) {
            void handleFile(file);
          }
        }}
      />
      <Group gap="xs">
        <Button
          leftSection={
            pending ? <Loader size="xs" /> : <IconUpload size={16} />
          }
          disabled={pending}
          variant="light"
          onClick={handlePick}
          data-testid="source-upload-button"
        >
          Upload &amp; Try
        </Button>
      </Group>

      {result && (
        <Alert
          color="green"
          variant="light"
          data-testid="source-upload-button-success"
        >
          <Stack gap={4}>
            {Object.entries(result.data)
              .filter(([key]) => !RESERVED_RESPONSE_FIELDS.has(key))
              .map(([key, url]) => (
                <Group key={key} gap="xs" wrap="nowrap">
                  <Code>{key}</Code>
                  <Code
                    data-testid={`source-upload-button-success-url-${key}`}
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: 220,
                    }}
                  >
                    {url}
                  </Code>
                  <CopyButton value={url}>
                    {({ copied, copy }) => (
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        leftSection={
                          copied ? (
                            <IconCheck size={12} />
                          ) : (
                            <IconCopy size={12} />
                          )
                        }
                        onClick={copy}
                        data-testid={`source-upload-button-copy-${key}`}
                      >
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    )}
                  </CopyButton>
                </Group>
              ))}
          </Stack>
        </Alert>
      )}

      {error && (
        <Alert
          color="red"
          variant="light"
          data-testid="source-upload-button-error"
        >
          {error.status !== null
            ? `${error.status}: ${error.message}`
            : error.message}
        </Alert>
      )}
    </Stack>
  );
}
