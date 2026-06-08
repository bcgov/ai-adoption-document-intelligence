import { Tag as BcdsTag } from "@bcgov/design-system-react-components";
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";

type BcdsTagProps = ComponentPropsWithoutRef<typeof BcdsTag>;
export type BcdsTagColor = NonNullable<BcdsTagProps["color"]>;

export type MantineBadgeSize =
  | "xs"
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | BcdsTagProps["size"];

/**
 * Maps Mantine Badge `color` to BC DS Tag `color`.
 * BC DS has no `orange`; use warning (yellow) for review/warning states.
 */
export function mapMantineColorToTagColor(
  color: string | undefined,
): BcdsTagColor {
  if (color == null || color === "") {
    return "gray";
  }

  switch (color) {
    case "gray":
    case "grey":
      return "gray";
    case "green":
      return "green";
    case "red":
      return "red";
    case "yellow":
      return "yellow";
    case "orange":
      return "yellow";
    case "blue":
    case "cyan":
      return "blue";
    case "bc-blue":
      return "bc-blue";
    case "bc-gold":
    case "gold":
      return "bc-gold";
    case "dark":
      return "dark";
    default:
      return "gray";
  }
}

export function mapMantineSizeToTagSize(
  size: MantineBadgeSize | undefined,
): BcdsTagProps["size"] {
  if (size === "xs" || size === "sm" || size === "small") {
    return "small";
  }
  return "medium";
}

export function extractTextValue(children: ReactNode): string {
  if (children == null || children === false) {
    return "";
  }
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map((child) => extractTextValue(child)).join("");
  }
  return "";
}

const MANTINE_SPACING: Record<string, string> = {
  xs: "0.625rem",
  sm: "0.75rem",
  md: "1rem",
  lg: "1.25rem",
  xl: "2rem",
};

/** Mantine `mt`/`mb`/`ml`/`mr` on Badge (string theme key or number). */
export function badgeMarginStyle(
  mt?: string | number,
  mb?: string | number,
  ml?: string | number,
  mr?: string | number,
): CSSProperties {
  const toCss = (v: string | number | undefined): string | undefined => {
    if (v == null) return undefined;
    if (typeof v === "number") {
      return `${v * 0.25}rem`;
    }
    return MANTINE_SPACING[v] ?? v;
  };
  return {
    marginTop: toCss(mt),
    marginBottom: toCss(mb),
    marginLeft: toCss(ml),
    marginRight: toCss(mr),
  };
}
