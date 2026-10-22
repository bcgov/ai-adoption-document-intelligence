/**
 * `DynamicNodeEditor` — shell for the dynamic-node authoring surface
 * (Phase 6 US-176 / Milestone E; lives at
 * `apps/frontend/src/features/workflow-builder/dynamic-nodes/`).
 *
 * Three panes in a Mantine `<Grid>`. From the `lg` breakpoint up:
 *   - CodePane on the left, in all the width the right-hand column leaves;
 *   - on the right, a column of {@link SIDE_COLUMN_WIDTH} holding the
 *     SignaturePreviewPane with the VersionHistoryPane under it.
 * Below `lg` the three stack in that order.
 *
 * Top bar: Publish + Delete buttons.
 *
 * Props are deliberately minimal — cross-cutting concerns (route nav,
 * close-after-publish on the in-situ modal, etc.) live on the mount.
 * The same component is reused by:
 *   - US-181 standalone management page (`layout="full-page"`)
 *   - US-183 in-situ Mantine `<Modal size="80%">` (`layout="modal"`,
 *     the default)
 *
 * In edit mode the editor is created only once the lineage's script has been
 * fetched — see {@link DynamicNodeEditor} for why.
 *
 * Publish flow:
 *   1. CodePane fires `onChange(text)` (debounced 150 ms inside) — the
 *      shell stores it in `currentText`.
 *   2. The shell maintains a derived `signature` via the shared parser
 *      (US-158/US-159) so the SignaturePreviewPane can render live.
 *   3. Publish click → `useDynamicNodePublish` mutates. On success the
 *      Mantine notification renders "Published v{n}"; on failure (400)
 *      the publish errors flow into the CodePane as `publishErrors` →
 *      gutter markers + strip.
 *
 * Delete (edit-mode only):
 *   - opens `modals.openConfirmModal` → `useDynamicNodeDelete` → on
 *     success closes via `onClose` + notification.
 */

import {
  type DynamicNodeSignature,
  type ParseError,
  parseDynamicNodeSignature,
} from "@ai-di/graph-workflow";
import {
  Alert,
  Anchor,
  Box,
  Button,
  Code,
  Collapse,
  Grid,
  Group,
  Loader,
  LoadingOverlay,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import type { ApiError } from "../sources/useSourceUpload";
import { DYNAMIC_NODE_BOILERPLATE } from "./boilerplate";
import { CodePane } from "./CodePane";
import type {
  DynamicNodeDetail,
  DynamicNodeVersionDetail,
} from "./dynamic-node-api";
import { SignaturePreviewPane } from "./SignaturePreviewPane";
import { adaptEntryToSignature } from "./signature-preview-helpers";
import { useDynamicNode } from "./useDynamicNode";
import { useDynamicNodeDelete } from "./useDynamicNodeDelete";
import { useDynamicNodePublish } from "./useDynamicNodePublish";
import { VersionHistoryPane } from "./VersionHistoryPane";

export type DynamicNodeEditorLayout = "modal" | "full-page";

export interface DynamicNodeEditorProps {
  /** Lineage slug. Undefined → create-mode (POST). Set → edit-mode (PUT). */
  slug?: string;
  /**
   * Called after a successful Publish (POST or PUT). Receives the
   * published slug — the in-situ modal uses this to drop the new node
   * on the canvas; the standalone page uses it to navigate to
   * `/dynamic-nodes/:slug` after a create.
   */
  onAfterPublish?: (publishedSlug: string) => void;
  /**
   * Called when the editor wants to close itself — e.g. post-Delete in
   * edit-mode (no slug to navigate back to). Modal-mount uses this to
   * close the `<Modal>`; full-page mount uses it to navigate back to
   * the management page list.
   */
  onClose?: () => void;
  /**
   * Where the editor is mounted: `"modal"` (default) in the builder's
   * windows, `"full-page"` on the `/dynamic-nodes` routes. Exposed as
   * `data-layout`. Both lay the three panes out the same way.
   */
  layout?: DynamicNodeEditorLayout;
}

/**
 * Width of the right-hand column (the signature preview over the version
 * history) from the `lg` breakpoint up.
 *
 * Both panes need a fixed width rather than a share of the window. A version
 * row puts its version badge, the head badge and the publish date on one
 * line, with View and Revert side by side: in BC Sans the widest such line (a
 * three-digit version, the head badge and "Jan 28, 2026, 12:59 PM") is 247 px,
 * and its card adds 18 px of padding and border. The preview's port rows put
 * the port name, its kind and a REQUIRED badge on one line, which for
 * "document : Document" fits in 256 px but not in 240. 304 px leaves room for
 * longer port and kind names, and stacking the two panes leaves the rest of
 * the row to the code.
 */
const SIDE_COLUMN_WIDTH = 304;

/**
 * A publish failure that is not about the script carries a `details` field.
 *
 * The backend answers an unreachable custom-node checker with a 503 whose
 * `message` is a sentence a person can act on ("The custom-node checker is not
 * running… start it with…") and whose `details` carries the diagnostic
 * (`POST http://…/check could not be reached: …`). This lifts `details` off the
 * response body so the editor can show the sentence and keep the diagnostic
 * one click away.
 */
function extractFailureDetails(err: unknown): string | null {
  const body = (err as { body?: unknown })?.body;
  if (typeof body !== "object" || body === null) return null;
  const details = (body as { details?: unknown }).details;
  return typeof details === "string" && details.length > 0 ? details : null;
}

/**
 * Phase 6 sweep: pull structured `ParseError[]` out of a publish 400's
 * response body. The wire layer (`dynamic-node-api.ts#parseErrorResponse`)
 * stashes the JSON body on `ApiError.body`; we shape-check it here so the
 * editor's gutter markers see ts-check + allowlist failures (which only
 * fire server-side) alongside the client-side jsdoc-parse + semantics
 * failures the live strip already covers.
 */
function extractServerParseErrors(err: unknown): ParseError[] {
  const body = (err as { body?: unknown })?.body;
  if (typeof body !== "object" || body === null) return [];
  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return [];
  const out: ParseError[] = [];
  for (const e of errors) {
    if (typeof e !== "object" || e === null) continue;
    const stage = (e as { stage?: unknown }).stage;
    const message = (e as { message?: unknown }).message;
    if (typeof stage !== "string" || typeof message !== "string") continue;
    if (
      stage !== "jsdoc-parse" &&
      stage !== "signature-semantics" &&
      stage !== "ts-check" &&
      stage !== "allowlist"
    )
      continue;
    out.push(e as ParseError);
  }
  return out;
}

/**
 * The editor for a new node, or for an existing lineage once its script is in
 * hand.
 *
 * In edit mode nothing is created until the detail fetch has landed, so the
 * code pane starts from the lineage's head script. A pane created before the
 * script arrives starts from the starter template and hands that text up from
 * its mount effect. Under React's StrictMode, which `main.tsx` turns on, a
 * newly mounted component's effects run a second time after its parent's, so
 * that template would land after the fetched script and replace it: in the
 * editor, the preview, and what Publish sends. This also means there is never
 * a buffer to type into that is about to be replaced.
 *
 * The three builder windows (the canvas node menu, the step list's palette and
 * the custom step's settings) mount this component directly; the full-page
 * route waits for the fetch itself. Gating here covers all of them.
 */
export function DynamicNodeEditor({
  slug,
  onAfterPublish,
  onClose,
  layout = "modal",
}: DynamicNodeEditorProps) {
  const detailQuery = useDynamicNode(slug);
  const detail = detailQuery.data;

  if (slug !== undefined && detail === undefined) {
    return (
      <Box
        pos="relative"
        data-testid="dynamic-node-editor"
        data-layout={layout}
      >
        {detailQuery.error ? (
          <Stack gap="md">
            <Title order={4} mb={0}>
              Editing {slug}
            </Title>
            <Alert
              color="red"
              title="Failed to load lineage"
              data-testid="dynamic-node-editor-load-error"
            >
              {detailQuery.error.message}
            </Alert>
          </Stack>
        ) : (
          <Stack
            align="center"
            justify="center"
            mih={240}
            gap="xs"
            data-testid="dynamic-node-editor-loading"
          >
            <Loader />
            <Text size="sm" c="dimmed">
              Loading {slug}…
            </Text>
          </Stack>
        )}
      </Box>
    );
  }

  return (
    <DynamicNodeEditorBody
      // A different lineage is a different document: start again from its
      // script rather than carrying this one's text across.
      key={slug ?? ""}
      slug={slug}
      initialScript={
        slug === undefined
          ? DYNAMIC_NODE_BOILERPLATE
          : (detail?.versions[0]?.script ?? "")
      }
      detail={detail}
      detailError={detailQuery.error}
      onAfterPublish={onAfterPublish}
      onClose={onClose}
      layout={layout}
    />
  );
}

interface DynamicNodeEditorBodyProps {
  slug: string | undefined;
  /** The text the editor is created with; read once, on mount. */
  initialScript: string;
  /** The lineage's versions (edit mode), kept current by the detail query. */
  detail: DynamicNodeDetail | undefined;
  /** A failed refetch; the editor stays usable with the last good detail. */
  detailError: ApiError | null;
  onAfterPublish?: (publishedSlug: string) => void;
  onClose?: () => void;
  layout: DynamicNodeEditorLayout;
}

function DynamicNodeEditorBody({
  slug,
  initialScript,
  detail,
  detailError,
  onAfterPublish,
  onClose,
  layout,
}: DynamicNodeEditorBodyProps) {
  const publishMutation = useDynamicNodePublish();
  const deleteMutation = useDynamicNodeDelete();

  // The editor's text. Seeded once from the fetched head script (edit) or the
  // starter template (create). A head that arrives later — the refetch after
  // a Publish — never replaces it, or it would discard what the author typed
  // while the round-trip was in flight; a revert sets it explicitly.
  const [currentText, setCurrentText] = useState<string>(initialScript);

  // ── Live signature parse (drives the SignaturePreviewPane) ────────────
  const liveSignature = useMemo<DynamicNodeSignature | null>(() => {
    const result = parseDynamicNodeSignature(currentText);
    if (result.errors.length > 0 || result.entry === null) return null;
    return adaptEntryToSignature(result.entry);
  }, [currentText]);

  // ── Publish-time errors — flow into the CodePane via `publishErrors`
  const [publishErrors, setPublishErrors] = useState<ParseError[]>([]);

  // Non-null while the CodePane cannot render the script.
  const [editorUnavailable, setEditorUnavailable] = useState<string | null>(
    null,
  );

  // The last publish failure, kept on screen. A notification is gone in four
  // seconds; a failure whose fix is "start this service and publish again"
  // has to survive long enough to be acted on, and its diagnostic has to be
  // readable without the browser console.
  const [publishFailure, setPublishFailure] = useState<{
    message: string;
    details: string | null;
    markerCount: number;
  } | null>(null);
  const [failureDetailsOpen, setFailureDetailsOpen] = useState(false);

  const isEditMode = slug !== undefined;

  // Publish disabled until the script parses cleanly (we always send
  // the raw script; the server re-parses + re-validates — but blocking
  // the click on parse failure shortens the round-trip). It is also
  // blocked while the editor cannot render: publishing a script the
  // author was never shown is worse than not publishing at all.
  const publishBlockedReason: string | null =
    editorUnavailable !== null
      ? `${editorUnavailable} Publishing is blocked until it loads.`
      : liveSignature === null && !isEditMode
        ? "Add a @workflow-node JSDoc header — the script has no valid signature yet"
        : null;

  const publishDisabled =
    publishMutation.isPending || publishBlockedReason !== null;

  const handlePublish = async () => {
    try {
      const result = await publishMutation.mutateAsync({
        slug,
        script: currentText,
      });
      setPublishErrors([]);
      setPublishFailure(null);
      notifications.show({
        title: `Published v${result.version}`,
        message: `Saved ${result.slug}.`,
        color: "green",
      });
      onAfterPublish?.(result.slug);
    } catch (err) {
      // Phase 6 sweep: ApiError.body now carries the server's 400 response
      // verbatim — `{ errors: ParseError[] }` from the publish endpoints.
      // Lift those structured errors into the editor markers so ts-check
      // and allowlist failures (which only fire server-side) render as
      // gutter squiggles + clickable strip lines, not just notification
      // text.
      const message = err instanceof Error ? err.message : String(err);
      const serverErrors = extractServerParseErrors(err);
      // Server didn't return structured errors (e.g. the 503 for an
      // unreachable checker, or a network drop) — fall back to a client-side
      // reparse so the user still sees jsdoc-parse + signature-semantics
      // issues in the strip. That reparse legitimately yields nothing when the
      // script is fine and the *service* is what failed, which is why the
      // failure's wording mentions markers only when some were produced.
      const markers =
        serverErrors.length > 0
          ? serverErrors
          : parseDynamicNodeSignature(currentText).errors;
      setPublishErrors(markers);
      setFailureDetailsOpen(false);
      setPublishFailure({
        message,
        details: extractFailureDetails(err),
        markerCount: markers.length,
      });
      notifications.show({
        title: "Publish failed",
        // Error markers are only promised when some were produced.
        message:
          markers.length > 0 ? `${message} — see error markers` : message,
        color: "red",
      });
    }
  };

  const handleDelete = () => {
    if (!slug) return;
    modals.openConfirmModal({
      title: `Delete ${slug}?`,
      children: (
        <Text size="sm">
          This soft-deletes the lineage. Workflows that reference{" "}
          <code>dyn.{slug}</code> will surface a "Deleted" badge on the canvas.
          To bring it back, publish a new dynamic node named <code>{slug}</code>
          {": that restores it, with its version history continued."}
        </Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await deleteMutation.mutateAsync(slug);
          notifications.show({
            title: "Deleted",
            message: `${slug} was soft-deleted.`,
            color: "green",
          });
          onClose?.();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          notifications.show({
            title: "Delete failed",
            message,
            color: "red",
          });
        }
      },
    });
  };

  const handleRevert = (version: DynamicNodeVersionDetail) => {
    if (!slug) return;
    publishMutation.mutate(
      { slug, script: version.script },
      {
        onSuccess: (result) => {
          setPublishErrors([]);
          setPublishFailure(null);
          // The one event after creation that replaces the editor's text:
          // the new head is the script the author asked for, so it goes into
          // the buffer here rather than through the refetched detail.
          setCurrentText(version.script);
          notifications.show({
            title: `Reverted to v${version.versionNumber} as v${result.version}`,
            message: `Saved ${result.slug}.`,
            color: "green",
          });
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : String(err);
          notifications.show({
            title: "Revert failed",
            message,
            color: "red",
          });
        },
      },
    );
  };

  return (
    <Box pos="relative" data-testid="dynamic-node-editor" data-layout={layout}>
      <LoadingOverlay
        visible={publishMutation.isPending || deleteMutation.isPending}
        zIndex={1000}
        overlayProps={{ blur: 0.5 }}
      />
      <Stack gap="md" h="100%">
        <Group justify="space-between" align="center" wrap="wrap">
          <Stack gap={0}>
            <Title order={4} mb={0}>
              {isEditMode ? `Editing ${slug}` : "New dynamic node"}
            </Title>
            <Text size="xs" c="dimmed">
              {isEditMode
                ? "Publish creates a new version on this lineage."
                : "Publish creates a new lineage (v1) under your group."}
            </Text>
          </Stack>
          <Group gap="xs">
            <Button
              onClick={handlePublish}
              disabled={publishDisabled}
              title={publishBlockedReason ?? undefined}
              data-testid="dynamic-node-editor-publish"
              loading={publishMutation.isPending}
            >
              Publish
            </Button>
            {isEditMode && (
              <Button
                color="red"
                variant="default"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                data-testid="dynamic-node-editor-delete"
                loading={deleteMutation.isPending}
              >
                Delete
              </Button>
            )}
          </Group>
        </Group>

        {detailError && (
          <Alert
            color="red"
            title="Failed to load lineage"
            data-testid="dynamic-node-editor-load-error"
          >
            {detailError.message}
          </Alert>
        )}

        {publishFailure && (
          <Alert
            color="red"
            variant="light"
            title="Publish failed"
            withCloseButton
            onClose={() => setPublishFailure(null)}
            closeButtonLabel="Dismiss the publish failure"
            data-testid="dynamic-node-editor-publish-error"
          >
            <Stack gap={6}>
              <Text
                size="sm"
                data-testid="dynamic-node-editor-publish-error-message"
              >
                {publishFailure.message}
              </Text>
              {publishFailure.markerCount > 0 && (
                <Text
                  size="xs"
                  c="dimmed"
                  data-testid="dynamic-node-editor-publish-error-markers"
                >
                  {publishFailure.markerCount === 1
                    ? "1 problem is marked in the editor below."
                    : `${publishFailure.markerCount} problems are marked in the editor below.`}
                </Text>
              )}
              {publishFailure.details !== null && (
                <>
                  <Anchor
                    component="button"
                    type="button"
                    size="xs"
                    onClick={() => setFailureDetailsOpen((open) => !open)}
                    data-testid="dynamic-node-editor-publish-error-details-toggle"
                  >
                    {failureDetailsOpen
                      ? "Hide technical details"
                      : "Show technical details"}
                  </Anchor>
                  <Collapse in={failureDetailsOpen}>
                    <Code
                      block
                      data-testid="dynamic-node-editor-publish-error-details"
                    >
                      {publishFailure.details}
                    </Code>
                  </Collapse>
                </>
              )}
            </Stack>
          </Alert>
        )}

        <Grid gutter="md" align="stretch">
          {/* `miw={0}`: a grid column's minimum width is its content's, and
              Monaco's content is the width it last laid itself out at, so
              without it this column could not shrink when the window does. */}
          <Grid.Col
            span={{ base: 12, lg: "auto" }}
            miw={0}
            data-testid="dynamic-node-editor-code-col"
          >
            <CodePane
              script={currentText}
              onChange={setCurrentText}
              publishErrors={publishErrors}
              onEditorUnavailable={setEditorUnavailable}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: "content" }}>
            <Stack gap="md" w={{ base: "100%", lg: SIDE_COLUMN_WIDTH }}>
              <Box data-testid="dynamic-node-editor-preview-col">
                <SignaturePreviewPane signature={liveSignature} />
              </Box>
              <Box data-testid="dynamic-node-editor-history-col">
                <VersionHistoryPane
                  slug={slug}
                  error={detailError}
                  versions={detail?.versions ?? []}
                  headVersionNumber={detail?.headVersion.versionNumber}
                  onRevert={handleRevert}
                />
              </Box>
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </Box>
  );
}

export default DynamicNodeEditor;
