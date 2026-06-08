import { Separator as BcdsSeparator } from "@bcgov/design-system-react-components";
import type { CSSProperties, ReactNode } from "react";
import { fieldMarginStyle } from "./formFieldUtils";

export interface AppDividerProps {
  label?: ReactNode;
  orientation?: "horizontal" | "vertical";
  variant?: string;
  mt?: string | number;
  mb?: string | number;
  className?: string;
}

/**
 * BC DS `Separator` with Mantine `Divider`-compatible props.
 */
export function Divider({
  label,
  orientation = "horizontal",
  mt,
  mb,
  className,
}: AppDividerProps) {
  const style: CSSProperties = {
    ...fieldMarginStyle(mt, mb),
  };

  if (orientation === "vertical") {
    return (
      <span
        className={className ?? "bcds-divider-vertical"}
        style={{
          ...style,
          display: "inline-block",
          alignSelf: "stretch",
          width: 1,
          minHeight: "1.5rem",
          backgroundColor: "var(--surface-color-border-default)",
        }}
        role="separator"
        aria-orientation="vertical"
      />
    );
  }

  return (
    <div className={className} style={style}>
      {label != null && label !== "" ? (
        <div className="bcds-divider-labeled">
          <BcdsSeparator />
          <span className="bcds-divider-label">{label}</span>
          <BcdsSeparator />
        </div>
      ) : (
        <BcdsSeparator />
      )}
    </div>
  );
}
