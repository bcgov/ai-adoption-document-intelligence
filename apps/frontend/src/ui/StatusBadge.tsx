import type { ReactNode } from "react";
import { BcdsTagChip } from "./BcdsTagChip";
import {
  extractTextValue,
  type MantineBadgeSize,
  mapMantineColorToTagColor,
  mapMantineSizeToTagSize,
} from "./tagUtils";

export type { MantineBadgeSize } from "./tagUtils";
export { mapMantineColorToTagColor } from "./tagUtils";

export interface AppStatusBadgeProps {
  children?: ReactNode;
  /** Mantine Badge color name */
  color?: string;
  size?: MantineBadgeSize;
  /** Mantine variants (light, outline, filled) — visual comes from BC DS Tag color tokens */
  variant?: "light" | "outline" | "filled" | "dot" | "gradient" | string;
  /** Mantine circular badge — maps to BC DS circular tag */
  circle?: boolean;
  className?: string;
  id?: string;
}

const STATUS_BADGE_CLASS = "bcds-status-badge";

export function StatusBadge({
  children,
  color,
  size,
  circle,
  className,
  id,
}: AppStatusBadgeProps) {
  const textValue = extractTextValue(children);
  const mergedClassName = className
    ? `${STATUS_BADGE_CLASS} ${className}`
    : STATUS_BADGE_CLASS;

  return (
    <span className={mergedClassName}>
      <BcdsTagChip
        id={id}
        color={mapMantineColorToTagColor(color)}
        size={mapMantineSizeToTagSize(size)}
        tagStyle={circle === false ? "rectangular" : "circular"}
        textValue={textValue}
      />
    </span>
  );
}
