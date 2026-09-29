/**
 * The single per-node "problems" indicator — the red / amber corner badge.
 *
 * Extracted from `WorkflowEditorCanvas` (G-031) so renderers that live outside
 * that file can mount it too. Source cards carry ERROR-severity validation
 * rules and had no badge at all, which let the top bar read "N issues" with
 * nothing marked anywhere on the graph.
 */
import { memo } from "react";

export interface ValidationBadgeProps {
  nodeId: string;
  errorCount: number;
  warningCount: number;
  onBadgeClick?: (nodeId: string) => void;
}

/**
 * Red / amber corner badge surfacing validation issues on a node.
 * Shared by all node renderers so activity and control-flow nodes look
 * the same. When `onBadgeClick` is provided, the badge becomes clickable
 * and the host opens the validation drawer scrolled to the relevant
 * entry.
 */
export const ValidationBadge = memo(function ValidationBadge({
  nodeId,
  errorCount,
  warningCount,
  onBadgeClick,
}: ValidationBadgeProps) {
  if (errorCount === 0 && warningCount === 0) return null;
  const title =
    errorCount > 0
      ? `${errorCount} error${errorCount === 1 ? "" : "s"}${warningCount > 0 ? `, ${warningCount} warning${warningCount === 1 ? "" : "s"}` : ""}`
      : `${warningCount} warning${warningCount === 1 ? "" : "s"}`;
  const background = errorCount > 0 ? "#e03131" : "#f59f00";
  const ariaLabel = `${title} — click to open validation drawer`;
  const commonStyle: React.CSSProperties = {
    position: "absolute",
    top: -7,
    // Top-LEFT so the diagnostics badge never collides with the run-status
    // badge (top-right). This is the single per-node "problems" indicator —
    // it now folds in the auto-wire input issues that used to be a separate
    // left-edge status dot.
    left: -7,
    background,
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 5px",
    boxShadow: "0 0 0 2px var(--mantine-color-body, #1a1b1e)",
    zIndex: 2,
  };
  const content = errorCount > 0 ? errorCount : warningCount;
  if (!onBadgeClick) {
    return (
      <div
        title={title}
        style={commonStyle}
        data-testid={`node-badge-${nodeId}`}
      >
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      data-testid={`node-badge-${nodeId}`}
      onClick={(e) => {
        e.stopPropagation();
        onBadgeClick(nodeId);
      }}
      // Stop xyflow from initiating a drag when the user mouses down on
      // the badge.
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        ...commonStyle,
        border: "none",
        cursor: "pointer",
      }}
    >
      {content}
    </button>
  );
});
