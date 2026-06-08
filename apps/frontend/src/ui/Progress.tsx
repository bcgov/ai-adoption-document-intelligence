import { ProgressBar as BcdsProgressBar } from "@bcgov/design-system-react-components";
import type { CSSProperties } from "react";
import { fieldMarginStyle } from "./formFieldUtils";

export interface AppProgressProps {
  value?: number;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "small" | "medium" | "large";
  color?: string;
  animated?: boolean;
  striped?: boolean;
  mt?: string | number;
  mb?: string | number;
  "data-testid"?: string;
}

function mapProgressSize(
  size: AppProgressProps["size"],
): "small" | "medium" | "large" | undefined {
  if (size === "xs" || size === "sm" || size === "small") return "small";
  if (size === "lg" || size === "xl" || size === "large") return "large";
  return "medium";
}

/**
 * BC DS `ProgressBar` with Mantine `Progress`-compatible props.
 */
export function Progress({
  value,
  size,
  animated,
  mt,
  mb,
  "data-testid": dataTestId,
}: AppProgressProps) {
  const wrapperStyle: CSSProperties = fieldMarginStyle(mt, mb);
  const isIndeterminate = animated && value == null;

  return (
    <div style={wrapperStyle} data-testid={dataTestId}>
      <BcdsProgressBar
        size={mapProgressSize(size)}
        value={isIndeterminate ? undefined : value}
        isIndeterminate={isIndeterminate}
      />
    </div>
  );
}
