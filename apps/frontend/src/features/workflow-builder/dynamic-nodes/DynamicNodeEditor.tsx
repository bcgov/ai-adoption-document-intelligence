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
  Box,
  Button,
  Grid,
  Group,
  LoadingOverlay,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useState } from "react";
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

  // Edit-mode: when the detail fetch lands, hydrate the editor with the
  // head version's script (only once per fetch — subsequent typing wins).
  useEffect(() => {
    if (slug && headScript !== undefined) {
      setCurrentText(headScript);
    }
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

  const isEditMode = slug !== undefined;

  // Publish disabled until the script parses cleanly (we always send
  // the raw script; the server re-parses + re-validates — but blocking
  // the click on parse failure shortens the round-trip).
  const publishDisabled =
    publishMutation.isPending || (liveSignature === null && !isEditMode);

  const handlePublish = async () => {
    try {
      const result = await publishMutation.mutateAsync({
        slug,
        script: currentText,
      });
      setPublishErrors([]);
      notifications.show({
        title: `Published v${result.version}`,
        message: `Saved ${result.slug}.`,
        color: "green",
      });
      onAfterPublish?.(result.slug);
    } catch (err) {
      // The backend's 400 carries `{ errors: ParseError[] }`. The
      // mutation's `ApiError` doesn't expose the parsed body directly
      // — we already surface the human-readable message on the
      // notification. Re-fetching the structured `errors[]` would
      // require either: (a) walking the response in the wire layer,
      // or (b) re-parsing. We pick (a): augment the publish wire path
      // to surface the structured errors as a typed sub-field. For
      // now: the notification carries the message; the CodePane's
      // live parse strip surfaces the parse stage errors immediately
      // (since the same parser runs client-side). `publishErrors` is
      // wired so the next augmentation (a) drops straight in.
      const message = err instanceof Error ? err.message : String(err);
      notifications.show({
        title: "Publish failed",
        message: `${message} — see error markers`,
        color: "red",
      });
      // We re-derive the structured errors on the client by parsing
      // again. This catches jsdoc-parse + signature-semantics errors;
      // ts-check / allowlist errors only fire server-side, so we'd
      // need the server response body to surface them as markers —
      // pending the wire augmentation, the user sees them in the
      // notification's message body.
      const reparse = parseDynamicNodeSignature(currentText);
      setPublishErrors(reparse.errors);
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

        <Grid gutter="md" align="stretch">
          <Grid.Col
            span={{ base: 12, md: spans.code }}
            data-testid="dynamic-node-editor-code-col"
          >
            <CodePane
              script={currentText}
              onChange={setCurrentText}
              publishErrors={publishErrors}
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
