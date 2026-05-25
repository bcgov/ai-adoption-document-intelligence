/**
 * `SourceUploadButton` — "Test upload" affordance rendered below the
 * parameters form on the `source.upload` node-settings panel (US-124).
 *
 * Wraps a hidden `<input type="file">` whose `accept` is built from the
 * source node's resolved `allowedMimeTypes`. On click the button
 * programmatically focuses the hidden input; selecting a file invokes
 * `useSourceUpload(workflowId, sourceNodeId).mutateAsync(file)`
 * (US-122).
 *
 * Surfaces:
 *  - In-flight: `<Loader size="xs" />` swap + disabled state.
 *  - 2xx: green `<Alert>` with each `ctxKey → URL` pair shown via a
 *    `<Code>` block + a `CopyButton`, and a Mantine notification.
 *  - 4xx (400 / 413): red `<Alert>` carrying the backend's error message
 *    and the HTTP status; button re-enables for retry.
 *  - Create mode (no `workflowId` yet): button is disabled inside a
 *    "Save the workflow first" tooltip — mirrors the Phase 2 Track 3
 *    History button precedent in `WorkflowEditorV2Page.tsx`.
 *
 * Per DOCUMENT_SOURCES_DESIGN.md §7.3 this is a settings-panel-side
 * test — it does NOT auto-open the Run drawer's Upload section.
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

import {
  ApiError,
  type SourceUploadResponse,
  useSourceUpload,
} from "./useSourceUpload";

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
      notifications.show({
        title: "Test upload succeeded",
        message: "Workflow can now use this URL via the Run drawer.",
        color: "green",
      });
    } catch (err) {
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
          Test upload
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
          Test upload
        </Button>
      </Group>

      {result && (
        <Alert
          color="green"
          variant="light"
          data-testid="source-upload-button-success"
        >
          <Stack gap={4}>
            {Object.entries(result.data).map(([key, url]) => (
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
