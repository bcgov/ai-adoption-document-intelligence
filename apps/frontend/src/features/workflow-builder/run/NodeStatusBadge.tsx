/**
 * `NodeStatusBadge` — tiny status indicator that mounts in the
 * top-right corner of every node renderer on the V2 canvas. Driven by
 * the live status map exposed through `RunStateContext` (US-138).
 *
 * **The glyph is bare, and the disc is the only circle** (Inderdeep, 2026-08-06
 * — *"to notice the cross within the circle is very hard … the more I zoom out,
 * all I see is the circle, which is not the intent"*). The badge used to draw
 * two concentric circles: the filled `ThemeIcon` disc, and inside it
 * `IconCircleCheck` / `IconCircleX`, which carry their own ring. At 16px the
 * rings ate the pixel budget and the check or cross that actually carries the
 * meaning was reduced to a smudge. The icons are now `IconCheck` / `IconX`
 * with no ring of their own, drawn heavier and larger inside a larger disc, so
 * the shape survives at the zoom levels people work at.
 *
 * Status → (icon, colour) mapping per REQUIREMENTS.md L32 +
 * TRY_IN_PLACE_DESIGN.md §3.5:
 *
 *   | Status    | Icon       | Colour |
 *   |-----------|------------|--------|
 *   | pending   | IconCircle | gray   |
 *   | running   | Loader     | blue   |
 *   | succeeded | IconCheck  | green  |
 *   | failed    | IconX      | red    |
 *   | skipped   | IconBolt   | violet |
 *
 * `pending` keeps `IconCircle`: there, the ring IS the meaning — an empty
 * outline reading "not started yet" — and it is the one status nobody has to
 * distinguish at a glance.
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

import { Box, Loader, ThemeIcon, Tooltip } from "@mantine/core";
import { IconBolt, IconCheck, IconCircle, IconX } from "@tabler/icons-react";
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
  Icon: ComponentType<{ size?: number; stroke?: number }> | null;
}

/**
 * Badge diameter and glyph size, in px. Both were raised on 2026-08-06 (disc
 * 16→20, glyph 12→15) as the second half of dropping the icons' own rings —
 * a bare check drawn at the old 12px inside the old 16px disc is legible, but
 * only just, and the point of the change is that it survives being zoomed out.
 */
const BADGE_SIZE = 20;
const GLYPH_SIZE = 15;
/** Heavier than Tabler's default 2 — a thin stroke is the other way to vanish. */
const GLYPH_STROKE = 2.6;

const STATUS_STYLES: Record<NodeStatusBadgeStatus, BadgeStyle> = {
  pending: { color: "gray", Icon: IconCircle },
  running: { color: "blue", Icon: null },
  succeeded: { color: "green", Icon: IconCheck },
  failed: { color: "red", Icon: IconX },
  skipped: { color: "violet", Icon: IconBolt },
  // Cancelled is forwarded by the polling hook but has no dedicated
  // affordance yet — render it like "pending" until US-141 lands the
  // cancel UX (matches the spec's silence on cancelled colour).
  cancelled: { color: "gray", Icon: IconCircle },
};

export interface NodeStatusBadgeProps {
  status: NodeStatusBadgeStatus;
  /**
   * The failed node's error message (from `NodeRunStatus.errorMessage`). When
   * present on a `failed` badge it's surfaced as a hover tooltip so the user
   * can see WHY a node failed directly on the canvas, instead of only learning
   * it "failed" and having to dig into run history.
   */
  errorMessage?: string;
}

/**
 * Render a `ThemeIcon` containing the Tabler icon for `status`. The
 * `running` state swaps in Mantine's `<Loader>` (the spinner the
 * design doc calls out) so the badge spins visually without a CSS
 * animation of our own. Size is `BADGE_SIZE` with `radius="xl"` to
 * match the small absolute-positioned corner overlay used by every
 * renderer.
 */
export function NodeStatusBadge({
  status,
  errorMessage,
}: NodeStatusBadgeProps): ReactNode {
  const style = STATUS_STYLES[status];
  const inner: ReactNode = style.Icon ? (
    <style.Icon size={GLYPH_SIZE} stroke={GLYPH_STROKE} />
  ) : (
    <Loader size={12} color="white" />
  );

  const badge = (
    <ThemeIcon
      data-testid="node-status-badge"
      data-status={status}
      data-color={style.color}
      color={style.color}
      variant="filled"
      size={BADGE_SIZE}
      radius="xl"
      style={
        status === "failed" && errorMessage ? { cursor: "help" } : undefined
      }
    >
      {inner}
    </ThemeIcon>
  );

  // Surface the failure reason on hover so it's visible on the canvas, not
  // buried in run history.
  if (status === "failed" && errorMessage) {
    return (
      <Tooltip
        label={errorMessage}
        multiline
        w={300}
        withArrow
        events={{ hover: true, focus: true, touch: true }}
        data-testid="node-status-badge-error-tooltip"
      >
        {badge}
      </Tooltip>
    );
  }

  return badge;
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
  // Idle suppression: the run-status badge is meaningful only while a run
  // (or replay) is active. At design time — no run kicked off, or the
  // renderer mounted in isolation outside a provider — render nothing so the
  // canvas isn't littered with gray "pending" dots that collide with the
  // validation badge in the same corner.
  if (!ctx?.activeRunId) return null;
  const entry = ctx.nodeStatuses[nodeId];
  const status: NodeStatusBadgeStatus = entry?.status ?? "pending";
  const errorMessage = entry?.errorMessage;
  const hoverable = status === "failed" && !!errorMessage;
  return (
    <Box
      pos="absolute"
      top={-6}
      right={-6}
      // Allow pointer events only when there's a failure tooltip to hover;
      // otherwise stay click-through so the badge never blocks the node.
      style={{ zIndex: 3, pointerEvents: hoverable ? "auto" : "none" }}
      data-testid={`node-status-badge-wrapper-${nodeId}`}
    >
      <NodeStatusBadge status={status} errorMessage={errorMessage} />
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
  // Idle suppression — see `NodeStatusBadgeOverlay`.
  if (!ctx?.activeRunId) return null;
  const status: NodeStatusBadgeStatus = getAggregateStatus(
    memberIds,
    ctx.nodeStatuses,
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
