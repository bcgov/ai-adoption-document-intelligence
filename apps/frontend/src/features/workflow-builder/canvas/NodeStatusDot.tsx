import type { NodeStatus } from "../auto-wire-status";

interface NodeStatusDotProps {
  status: NodeStatus;
  onClick?: () => void;
}

export function NodeStatusDot({ status, onClick }: NodeStatusDotProps) {
  if (status === "ok") return null;
  const colour = status === "ambiguous" ? "#d4a017" : "#e03131";
  return (
    <div
      data-testid="node-status-dot"
      data-status={status}
      onClick={onClick}
      style={{
        position: "absolute",
        left: -10,
        top: 8,
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: colour,
        cursor: onClick ? "pointer" : "default",
      }}
    />
  );
}
