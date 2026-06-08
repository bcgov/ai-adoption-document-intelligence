import type { CSSProperties, MouseEventHandler, ReactNode } from "react";
import { BcdsTagChip } from "./BcdsTagChip";
import {
  badgeMarginStyle,
  extractTextValue,
  type MantineBadgeSize,
  mapMantineColorToTagColor,
  mapMantineSizeToTagSize,
} from "./tagUtils";

export interface AppBadgeProps {
  children?: ReactNode;
  /** Mantine Badge color name */
  color?: string;
  size?: MantineBadgeSize;
  /** Mantine variants — visual comes from BC DS Tag color tokens */
  variant?: "light" | "outline" | "filled" | "dot" | "gradient" | string;
  circle?: boolean;
  leftSection?: ReactNode;
  className?: string;
  id?: string;
  mt?: string | number;
  mb?: string | number;
  ml?: string | number;
  mr?: string | number;
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLSpanElement>;
  "data-testid"?: string;
}

const BADGE_CLASS = "bcds-badge";

/**
 * BC DS `Tag` with Mantine-compatible `Badge` API.
 */
export function Badge({
  children,
  color,
  size,
  circle,
  leftSection,
  className,
  id,
  mt,
  mb,
  ml,
  mr,
  style,
  onClick,
  "data-testid": dataTestId,
}: AppBadgeProps) {
  const textValue =
    extractTextValue(children).trim() || (leftSection != null ? "Badge" : "");
  const mergedClassName = className
    ? `${BADGE_CLASS} ${className}`
    : BADGE_CLASS;
  const marginStyle = badgeMarginStyle(mt, mb, ml, mr);
  const wrapperStyle: CSSProperties = { ...marginStyle, ...style };

  return (
    <span
      className={mergedClassName}
      style={wrapperStyle}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      {...(dataTestId ? { "data-testid": dataTestId } : {})}
    >
      <BcdsTagChip
        id={id}
        color={mapMantineColorToTagColor(color)}
        size={mapMantineSizeToTagSize(size)}
        tagStyle={circle === false ? "rectangular" : "circular"}
        textValue={textValue}
        icon={leftSection}
      />
    </span>
  );
}
