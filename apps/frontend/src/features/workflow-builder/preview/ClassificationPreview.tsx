/**
 * `ClassificationPreview` — compact label-and-confidence widget for
 * the `Classification` `ArtifactKind`.
 *
 * Renders a `<Badge>` (label) + `<Progress>` (confidence bar) + text
 * percentage + dimmed matched-rule line. Multi-result arrays render the
 * top-confidence entry prominently with a "+N more" chip that opens a
 * Popover listing all results sorted by confidence desc.
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L38
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-145-classification-preview.md
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §4.5
 */

import { Badge, Group, Popover, Progress, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

export interface ClassificationPreviewProps {
  value: unknown;
}

/**
 * Phase 4 Classification result shape. `metadata` (e.g., matched region
 * polygon) is intentionally ignored in Phase 4 — Phase 4.x may surface
 * it. See US-145 technical notes.
 */
interface Classification {
  label: string;
  confidence: number;
  ruleName?: string;
}

function isClassification(input: unknown): input is Classification {
  if (input === null || typeof input !== "object") {
    return false;
  }
  const obj = input as Record<string, unknown>;
  return typeof obj.label === "string" && typeof obj.confidence === "number";
}

/**
 * Pick the Mantine palette colour for a confidence value. Bands:
 *   - `≥ 0.8`  → `green`
 *   - `0.5 – 0.8` → `yellow` (closest Mantine name to "amber")
 *   - `< 0.5`  → `red`
 *
 * `NaN` falls into the `< 0.5` branch.
 */
function bandColor(confidence: number): "green" | "yellow" | "red" {
  if (confidence >= 0.8) return "green";
  if (confidence >= 0.5) return "yellow";
  return "red";
}

/**
 * Visual bar value — clamped to `[0, 100]`. `NaN` → `0`. The textual
 * percentage label uses the raw (un-clamped) value so out-of-band data
 * surfaces as e.g. "150%" rather than being silently hidden.
 */
function clampedBarValue(confidence: number): number {
  if (Number.isNaN(confidence)) return 0;
  return Math.max(0, Math.min(100, confidence * 100));
}

function formatPercent(confidence: number): string {
  if (Number.isNaN(confidence)) return "—";
  // 2-decimal precision, drop trailing zeros (e.g. `87.00` → `87`,
  // `87.50` → `87.5`, `150.00` → `150`).
  const pct = confidence * 100;
  return `${Number(pct.toFixed(2))}%`;
}

function ClassificationRow({
  item,
  prominent,
}: {
  item: Classification;
  prominent: boolean;
}): ReactNode {
  const color = bandColor(item.confidence);
  const barValue = clampedBarValue(item.confidence);
  const label = formatPercent(item.confidence);
  return (
    <Stack gap={4} data-testid="classification-row">
      <Group gap="xs" align="center" wrap="nowrap">
        <Badge
          size={prominent ? "lg" : "sm"}
          variant="filled"
          color={color}
          data-testid="classification-label"
        >
          {item.label}
        </Badge>
      </Group>
      <Group gap="xs" align="center" wrap="nowrap">
        <Progress
          value={barValue}
          color={color}
          size="xs"
          style={{ flex: 1 }}
          data-testid="classification-bar"
          aria-label={`confidence ${label}`}
        />
        <Text size="xs" data-testid="classification-percent">
          {label}
        </Text>
      </Group>
      {item.ruleName !== undefined && item.ruleName !== "" ? (
        <Text size="xs" c="dimmed" data-testid="classification-rule">
          matched by: {item.ruleName}
        </Text>
      ) : null}
    </Stack>
  );
}

export function ClassificationPreview({
  value,
}: ClassificationPreviewProps): ReactNode {
  // Multi-result: array of Classifications. Empty / malformed-entry
  // arrays fall back to the "no result" branch.
  if (Array.isArray(value)) {
    const items = value.filter(isClassification);
    if (items.length === 0) {
      return <Text size="sm">No classification result</Text>;
    }
    const sorted = [...items].sort((a, b) => b.confidence - a.confidence);
    const [top, ...rest] = sorted;
    return (
      <Stack gap="xs" data-testid="classification-preview">
        <ClassificationRow item={top} prominent />
        {rest.length > 0 ? (
          <Popover position="bottom-end" withArrow shadow="md">
            <Popover.Target>
              <Badge
                variant="light"
                size="sm"
                style={{ cursor: "pointer", alignSelf: "flex-end" }}
                data-testid="classification-more-chip"
              >
                +{rest.length} more
              </Badge>
            </Popover.Target>
            <Popover.Dropdown data-testid="classification-more-popover">
              <Stack gap="xs">
                {sorted.map((item, idx) => (
                  <ClassificationRow
                    key={`${item.label}-${idx}`}
                    item={item}
                    prominent={false}
                  />
                ))}
              </Stack>
            </Popover.Dropdown>
          </Popover>
        ) : null}
      </Stack>
    );
  }

  if (!isClassification(value)) {
    return <Text size="sm">No classification result</Text>;
  }

  return (
    <Stack gap="xs" data-testid="classification-preview">
      <ClassificationRow item={value} prominent />
    </Stack>
  );
}
