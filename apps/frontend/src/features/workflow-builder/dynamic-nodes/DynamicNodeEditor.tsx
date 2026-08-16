/**
 * `DynamicNodeEditor` — shell for the dynamic-node authoring surface
 * (Phase 6 US-176 / Milestone E; lives at
 * `apps/frontend/src/features/workflow-builder/dynamic-nodes/`).
 *
 * Three-pane Mantine `<Grid>`:
 *   - CodePane (~60% modal / ~70% full-page)
 *   - SignaturePreviewPane (~25% / ~20%)
 *   - VersionHistoryPane (~15% / ~10%)
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
import { useEffect, useMemo, useRef, useState } from "react";
import { DYNAMIC_NODE_BOILERPLATE } from "./boilerplate";
import { CodePane } from "./CodePane";
import type { DynamicNodeVersionDetail } from "./dynamic-node-api";
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
   * Layout mode. Determines the pane width ratio:
   *   - `"modal"` (default): 60 / 25 / 15
   *   - `"full-page"`: 70 / 20 / 10
   *
   * Both layouts render the same three panes — only the grid
   * proportions change.
   */
  layout?: DynamicNodeEditorLayout;
}

interface PaneSpan {
  code: number;
  preview: number;
  history: number;
}

/**
 * Mantine `<Grid>` uses a 12-column system. The layout knob picks one
 * of two presets; both sum to 12 and approximate the brief's percentages.
 */
const PANE_SPANS: Record<DynamicNodeEditorLayout, PaneSpan> = {
  modal: { code: 7, preview: 3, history: 2 }, // ~58 / 25 / 17
  "full-page": { code: 8, preview: 3, history: 1 }, // ~67 / 25 / 8
};

/**
 * D3 (residual) — a publish failure that is NOT about the script.
 *
 * The backend now answers an unreachable custom-node checker with a 503 whose
 * `message` is a sentence a person can act on ("The custom-node checker is not
 * running… start it with…") and whose `details` carries the diagnostic that
 * used to be the headline (`POST http://…/check could not be reached: …`).
 * This lifts `details` off the response body so the editor can show the
 * sentence and keep the diagnostic one click away, instead of what it did
 * before: append `" — see error markers"` to a failure that produces no
 * markers at all.
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

export function DynamicNodeEditor({
  slug,
  onAfterPublish,
  onClose,
  layout = "modal",
}: DynamicNodeEditorProps) {
  const detailQuery = useDynamicNode(slug);
  const publishMutation = useDynamicNodePublish();
  const deleteMutation = useDynamicNodeDelete();

  // ── Editor text — seeded from boilerplate (create) or headVersion.script (edit)
  const headScript = detailQuery.data?.versions[0]?.script;
  const initialScript = useMemo(
    () => headScript ?? (slug ? "" : DYNAMIC_NODE_BOILERPLATE),
    [headScript, slug],
  );
  const [currentText, setCurrentText] = useState<string>(initialScript);

  /**
   * Edit-mode: hydrate the editor from the head version's script when the
   * detail fetch lands — ONCE per lineage.
   *
   * D8 — the dep is a string, so the classic "new object per refetch" trap was
   * already avoided, but there was no once-per-slug guard, and this component
   * is mounted by three modals (the canvas node menu, the palette, the
   * dynamic-node settings body) while `detailQuery` is still loading. Those
   * mounts show the boilerplate, the author starts typing, the fetch lands
   * 200–500 ms later and `headScript` changes — clobbering what was typed.
   * Publishing does the same thing, because it invalidates the detail query.
   * The full-page route (`DynamicNodeEditPage`) gates on `isLoading` and was
   * always immune; the modals are not, and this makes them so.
   *
   * Revert deliberately does NOT come through here — it re-seeds the editor
   * itself in `handleRevert`, because a guard keyed on the lineage cannot
   * distinguish "the same head arriving again" from "a new head the author
   * asked for".
   */
  const hydratedSlugRef = useRef<string | null>(null);
  useEffect(() => {
    if (!slug || headScript === undefined) return;
    if (hydratedSlugRef.current === slug) return;
    hydratedSlugRef.current = slug;
    setCurrentText(headScript);
  }, [slug, headScript]);

  // Create-mode: when the editor mounts with no slug, ensure the editor
  // text is the boilerplate. (The initial state covers the first render;
  // this effect covers a slug-removal which doesn't happen in 6.0 but
  // is the conservative default.)
  useEffect(() => {
    if (!slug) {
      setCurrentText(DYNAMIC_NODE_BOILERPLATE);
    }
    // We intentionally omit `currentText` from the dependency list —
    // running this effect on every keystroke would clobber the user's
    // edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // ── Live signature parse (drives the SignaturePreviewPane) ────────────
  const liveSignature = useMemo<DynamicNodeSignature | null>(() => {
    const result = parseDynamicNodeSignature(currentText);
    if (result.errors.length > 0 || result.entry === null) return null;
    return adaptEntryToSignature(result.entry);
  }, [currentText]);

  // ── Publish-time errors — flow into the CodePane via `publishErrors`
  const [publishErrors, setPublishErrors] = useState<ParseError[]>([]);

  // D-13 — non-null while the CodePane cannot render the script.
  const [editorUnavailable, setEditorUnavailable] = useState<string | null>(
    null,
  );

  // D3 (residual) — the last publish failure, kept on screen. A notification
  // is gone in four seconds; a failure whose fix is "start this service and
  // publish again" has to survive long enough to be acted on, and its
  // diagnostic has to be readable without the browser console.
  const [publishFailure, setPublishFailure] = useState<{
    message: string;
    details: string | null;
    markerCount: number;
  } | null>(null);
  const [failureDetailsOpen, setFailureDetailsOpen] = useState(false);

  const isEditMode = slug !== undefined;

  // Publish disabled until the script parses cleanly (we always send
  // the raw script; the server re-parses + re-validates — but blocking
  // the click on parse failure shortens the round-trip). D-13 adds the
  // editor's own availability: publishing a script the author was never
  // shown is worse than not publishing at all.
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
      // script is fine and the *service* is what failed, which is exactly the
      // case the old copy mis-described.
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
        // D3 — error markers are only promised when some were produced.
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
          Restore from the management page.
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
          // D8 — the editor used to pick the reverted script up indirectly,
          // via the invalidated detail query re-running the hydration effect.
          // That effect is now once-per-lineage (it has to be, or a modal's
          // in-flight fetch clobbers what the author typed), so revert states
          // its own intent: this is the one place a new head should replace
          // the buffer.
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

  const spans = PANE_SPANS[layout];

  /**
   * D8 — nothing may be typed into a buffer that is about to be replaced.
   *
   * In edit mode the script arrives with the detail fetch. Rendering the code
   * pane before it lands showed the boilerplate, let the author start typing,
   * and then overwrote what they typed when the fetch resolved 200–500 ms
   * later — the reviewer's "maybe this is happening when it reloads". The
   * full-page route (`DynamicNodeEditPage`) has always gated on `isLoading`
   * and was immune; the three modal mount sites (canvas node menu, palette,
   * dynamic-node settings body) mount this component directly and were not.
   * Gating here fixes all three at once, and keeps one rule rather than four.
   */
  if (isEditMode && detailQuery.isLoading) {
    return (
      <Box
        pos="relative"
        data-testid="dynamic-node-editor"
        data-layout={layout}
      >
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
      </Box>
    );
  }

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

        {detailQuery.error && (
          <Alert
            color="red"
            title="Failed to load lineage"
            data-testid="dynamic-node-editor-load-error"
          >
            {detailQuery.error.message}
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
          <Grid.Col
            span={{ base: 12, md: spans.code }}
            data-testid="dynamic-node-editor-code-col"
          >
            <CodePane
              script={currentText}
              onChange={setCurrentText}
              publishErrors={publishErrors}
              onEditorUnavailable={setEditorUnavailable}
            />
          </Grid.Col>
          <Grid.Col
            span={{ base: 12, md: spans.preview }}
            data-testid="dynamic-node-editor-preview-col"
          >
            <SignaturePreviewPane signature={liveSignature} />
          </Grid.Col>
          <Grid.Col
            span={{ base: 12, md: spans.history }}
            data-testid="dynamic-node-editor-history-col"
          >
            <VersionHistoryPane
              slug={slug}
              isLoading={isEditMode && detailQuery.isLoading}
              error={detailQuery.error}
              versions={detailQuery.data?.versions ?? []}
              headVersionNumber={detailQuery.data?.headVersion.versionNumber}
              onRevert={handleRevert}
            />
          </Grid.Col>
        </Grid>
      </Stack>
    </Box>
  );
}

export default DynamicNodeEditor;
