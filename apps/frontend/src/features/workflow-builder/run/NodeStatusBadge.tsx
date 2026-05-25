/**
 * `NodeStatusBadge` — tiny status indicator that mounts in the
 * top-right corner of every node renderer on the V2 canvas. Driven by
 * the live status map exposed through `RunStateContext` (US-138).
 *
 * Status → (icon, colour) mapping per REQUIREMENTS.md L32 +
 * TRY_IN_PLACE_DESIGN.md §3.5:
 *
 *   | Status    | Icon            | Colour |
 *   |-----------|-----------------|--------|
 *   | pending   | IconCircle      | gray   |
 *   | running   | Loader          | blue   |
 *   | succeeded | IconCircleCheck | green  |
 *   | failed    | IconCircleX     | red    |
 *   | skipped   | IconBolt        | violet |
 *
 * The badge is intentionally render-only — it never subscribes to a
 * query itself. The renderer that mounts it owns the
 * `useNodeRunStatus(nodeId)` lookup so the badge's prop surface stays
 * narrow and trivially testable.
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L32
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-138-node-status-badge.md
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §3.5
 */

import { Box, Loader, ThemeIcon } from "@mantine/core";
import {
  IconBolt,
  IconCircle,
  IconCircleCheck,
  IconCircleX,
} from "@tabler/icons-react";
import type { ComponentType, ReactNode } from "react";

import type { NodeRunStatusValue } from "./node-status.types";
import { getAggregateStatus, useOptionalRunState } from "./RunStateContext";

/**
 * Statuses surfaced by the badge. `cancelled` is forwarded by the
 * polling hook (US-137) but not yet a UI affordance — the design
 * surface only colours the five lifecycle states. Cancelled flows
 * through to the "pending" gray empty-circle visually so the badge
 * still renders something sensible until US-141 designs the cancel
 * UX.
 */
export type NodeStatusBadgeStatus = NodeRunStatusValue;

interface BadgeStyle {
  /** Mantine palette color. */
  color: string;
  /** Tabler icon component (or `null` to render a `<Loader>`). */
  Icon: ComponentType<{ size?: number }> | null;
}

const STATUS_STYLES: Record<NodeStatusBadgeStatus, BadgeStyle> = {
  pending: { color: "gray", Icon: IconCircle },
  running: { color: "blue", Icon: null },
  succeeded: { color: "green", Icon: IconCircleCheck },
  failed: { color: "red", Icon: IconCircleX },
  skipped: { color: "violet", Icon: IconBolt },
  // Cancelled is forwarded by the polling hook but has no dedicated
  // affordance yet — render it like "pending" until US-141 lands the
  // cancel UX (matches the spec's silence on cancelled colour).
  cancelled: { color: "gray", Icon: IconCircle },
};

export interface NodeStatusBadgeProps {
  status: NodeStatusBadgeStatus;
}

/**
 * Render a `ThemeIcon` containing the Tabler icon for `status`. The
 * `running` state swaps in Mantine's `<Loader>` (the spinner the
 * design doc calls out) so the badge spins visually without a CSS
 * animation of our own. Size is fixed at `xs` with `radius="xl"` to
 * match the small absolute-positioned corner overlay used by every
 * renderer.
 */
export function NodeStatusBadge({ status }: NodeStatusBadgeProps): ReactNode {
  const style = STATUS_STYLES[status];
  const inner: ReactNode = style.Icon ? (
    <style.Icon size={12} />
  ) : (
    <Loader size={10} color="white" />
  );

  return (
    <ThemeIcon
      data-testid="node-status-badge"
      data-status={status}
      data-color={style.color}
      color={style.color}
      variant="filled"
      size="xs"
      radius="xl"
    >
      {inner}
    </ThemeIcon>
  );
}

/**
 * Absolute-positioned overlay used by every node renderer. Looks up
 * the node's status from `RunStateContext` and renders the badge in
 * the renderer's top-right corner. Renderers add this with a single
 * JSX line and one import — no other surgery.
 */
export function NodeStatusBadgeOverlay({
  nodeId,
}: {
  nodeId: string;
}): ReactNode {
  const ctx = useOptionalRunState();
  const status: NodeStatusBadgeStatus =
    ctx?.nodeStatuses[nodeId]?.status ?? "pending";
  return (
    <Box
      pos="absolute"
      top={-6}
      right={-6}
      style={{ zIndex: 3, pointerEvents: "none" }}
      data-testid={`node-status-badge-wrapper-${nodeId}`}
    >
      <NodeStatusBadge status={status} />
    </Box>
  );
}

/**
 * Aggregate-status variant for `GroupChipNode`. Computes the group's
 * roll-up status from the live status map (failed > running >
 * succeeded > pending) and renders the same badge in the same corner.
 */
export function GroupAggregateStatusBadgeOverlay({
  memberIds,
}: {
  memberIds: readonly string[];
}): ReactNode {
  const ctx = useOptionalRunState();
  const status: NodeStatusBadgeStatus = getAggregateStatus(
    memberIds,
    ctx?.nodeStatuses ?? {},
  );
  return (
    <Box
      pos="absolute"
      top={-6}
      right={-6}
      style={{ zIndex: 3, pointerEvents: "none" }}
      data-testid="node-status-badge-wrapper-group"
    >
      <NodeStatusBadge status={status} />
    </Box>
  );
}
