import { getArtifactKindMeta, type KindRef } from "@ai-di/graph-workflow";
import { Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

import { splitKindRef } from "../canvas/artifact-kind-colour";
import { ClassificationPreview } from "./ClassificationPreview";
import { DocumentPreview } from "./DocumentPreview";
import { JsonValuePreview } from "./JsonValuePreview";
import { OcrResultPreview } from "./OcrResultPreview";
import { SegmentArrayPreview } from "./SegmentArrayPreview";

/**
 * Shared kind→widget dispatch. Given an artifact-kind literal and the value
 * that conforms to it, returns the preview widget for that value.
 *
 * Single source of truth for the mapping so the node-card preview
 * (`PreviewWidget`) and the wire peek (`WirePeekPopover`) can never drift.
 *
 * **It never returns `null`** (G-011). It used to `return null` for every kind
 * outside `Document` / `OcrResult` / `Classification` scalars and `Segment[]`
 * — 15 of the 27 registered kinds in scalar form and 15 in array form — and
 * the callers rendered that as an empty card indistinguishable from a bug.
 * Now every value lands in one of three places:
 *
 *   1. a dedicated widget, resolved by walking the kind's `baseKind` chain;
 *   2. the generic `JsonValuePreview` fallback, captioned with the kind so the
 *      author knows why it is raw rather than styled;
 *   3. an explicit "no value" line naming the kind, when the ctx key holds
 *      nothing at all.
 *
 * Resolution walks the `baseKind` chain from the EXACT kind upward, so an
 * exact-kind entry overrides its family. That is what stops `LabeledDocumentMap`
 * (`baseKind: Classification`, but a deliberately schema-free
 * `Record<label, documents>`) from being handed to the label-pill widget, whose
 * `{label, confidence}` type guard can never match it.
 */

type ValueRenderer = (value: unknown) => ReactNode;

/** Renderers for scalar (non-array) kinds, keyed by exact kind name. */
const SCALAR_RENDERERS: Readonly<Record<string, ValueRenderer>> = {
  Document: (v) => <DocumentPreview value={v} />,
  OcrResult: (v) => <OcrResultPreview value={v} />,
  Classification: (v) => <ClassificationPreview value={v} />,
  // Exact-kind override: a Classification SUBKIND whose shape diverges from
  // its family. The registry entry itself flags it as schema-free.
  LabeledDocumentMap: (v) => <JsonValuePreview value={v} />,
};

/** Renderers for array kinds, keyed by the exact ELEMENT kind name. */
const ARRAY_RENDERERS: Readonly<Record<string, ValueRenderer>> = {
  Segment: (v) => <SegmentArrayPreview value={v} />,
};

/** Belt-and-suspenders bound on the `baseKind` walk (matches the registry's). */
const MAX_FAMILY_CHAIN = 16;

/**
 * Walk `kind` → `baseKind` → … through the LIVE registry, returning the first
 * renderer found. Exact kind wins over its base, which wins over its family
 * root — the escape hatch a pure family-root dispatch lacked.
 */
function resolveRenderer(
  table: Readonly<Record<string, ValueRenderer>>,
  kind: string,
): ValueRenderer | undefined {
  let current = kind;
  for (let i = 0; i < MAX_FAMILY_CHAIN; i++) {
    const hit = table[current];
    if (hit !== undefined) return hit;
    const base = getArtifactKindMeta(current)?.baseKind;
    if (base === undefined) return undefined;
    current = base;
  }
  return undefined;
}

/**
 * The generic structured view. Legible for any JSON shape, and captioned with
 * the kind so "why is this raw?" has an answer on screen.
 */
function GenericKindValue({
  kind,
  value,
}: {
  kind: string | null;
  value: unknown;
}): ReactNode {
  return (
    <Stack gap={2} data-testid="preview-generic-value">
      <Text size="xs" c="dimmed" data-testid="preview-generic-kind">
        {kind === null || kind === ""
          ? "No declared kind — showing the raw value"
          : `${kind} — no dedicated preview, showing the raw value`}
      </Text>
      <JsonValuePreview value={value} />
    </Stack>
  );
}

/**
 * There is a cache row, but the ctx key this port binds holds nothing. Say
 * which kind was expected rather than drawing an empty card.
 */
function UnavailableValue({ kind }: { kind: string | null }): ReactNode {
  return (
    <Text size="xs" c="dimmed" data-testid="preview-value-unavailable">
      {kind === null || kind === ""
        ? "No value was recorded for this output."
        : `No value was recorded for this output (expected ${kind}).`}
    </Text>
  );
}

export function renderKindValue(
  kind: string | null,
  value: unknown,
): ReactNode {
  // `undefined` is a sound "absent" signal — JSON leaves are never `undefined`.
  if (value === undefined) {
    return <UnavailableValue kind={kind} />;
  }
  if (!kind) {
    return <GenericKindValue kind={null} value={value} />;
  }
  const { baseKind, isArray } = splitKindRef(kind as KindRef);
  const renderer = resolveRenderer(
    isArray ? ARRAY_RENDERERS : SCALAR_RENDERERS,
    baseKind,
  );
  if (renderer !== undefined) {
    return renderer(value);
  }
  return <GenericKindValue kind={kind} value={value} />;
}
