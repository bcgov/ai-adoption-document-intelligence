import type { CSSProperties } from "react";
import { rem } from "./spacingUtils";

export type BcdsTextColor =
  | "primary"
  | "primaryInvert"
  | "secondary"
  | "secondaryInvert"
  | "disabled"
  | "danger";

export type BcdsTextSize = "small" | "medium" | "large";

type MantineTextSize =
  | "xs"
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | BcdsTextSize
  | (string & {});

type MantineSpacing = number | string | undefined;

const MANTINE_COLOR_TO_CSS: Record<string, string> = {
  dimmed: "var(--typography-color-secondary)",
  red: "var(--typography-color-danger)",
  blue: "var(--typography-color-link)",
  green: "var(--icons-color-success)",
  yellow: "var(--support-border-color-warning)",
  orange: "var(--support-border-color-warning)",
};

const MANTINE_COLOR_TO_BCDS: Record<string, BcdsTextColor> = {
  dimmed: "secondary",
  red: "danger",
};

/**
 * Maps Mantine `size` to BC DS Text sizes.
 */
export function mapMantineTextSize(
  size: MantineTextSize | undefined,
): BcdsTextSize {
  switch (size) {
    case "xs":
    case "sm":
    case "small":
      return "small";
    case "lg":
    case "xl":
    case "large":
      return "large";
    case "md":
    case "medium":
    case undefined:
      return "medium";
    default:
      return "medium";
  }
}

/**
 * Maps Mantine `c` (color) to BC DS semantic color and optional CSS override.
 */
export function mapMantineColor(c: string | undefined): {
  bcdsColor: BcdsTextColor;
  inlineColor?: string;
} {
  if (c == null || c === "") {
    return { bcdsColor: "primary" };
  }

  const bcds = MANTINE_COLOR_TO_BCDS[c];
  if (bcds) {
    return { bcdsColor: bcds };
  }

  const css = MANTINE_COLOR_TO_CSS[c];
  if (css) {
    return { bcdsColor: "primary", inlineColor: css };
  }

  // Mantine theme keys (e.g. custom) or raw CSS values
  return { bcdsColor: "primary", inlineColor: c };
}

function spacingToCss(value: MantineSpacing): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value === "number") {
    return rem(value);
  }
  return rem(value);
}

export interface MantineTypographyStyleProps {
  ta?: CSSProperties["textAlign"];
  td?: CSSProperties["textDecoration"];
  tt?: CSSProperties["textTransform"];
  fs?: CSSProperties["fontStyle"] | "italic" | "normal";
  ff?: string;
  fw?: CSSProperties["fontWeight"] | number;
  inline?: boolean;
  lineClamp?: number;
  truncate?: boolean;
  mt?: MantineSpacing;
  mb?: MantineSpacing;
  ml?: MantineSpacing;
  mr?: MantineSpacing;
  mx?: MantineSpacing;
  py?: MantineSpacing;
  px?: MantineSpacing;
  p?: MantineSpacing;
  pl?: MantineSpacing;
  pr?: MantineSpacing;
  style?: CSSProperties;
}

export function buildTypographyStyle(
  props: MantineTypographyStyleProps,
  inlineColor?: string,
): CSSProperties | undefined {
  const {
    ta,
    td,
    tt,
    fs,
    ff,
    fw,
    inline,
    lineClamp,
    truncate,
    mt,
    mb,
    ml,
    mr,
    mx,
    py,
    px,
    p,
    pl,
    pr,
    style,
  } = props;

  const merged: CSSProperties = { ...style };

  if (inlineColor) {
    merged.color = inlineColor;
  }
  if (ta) {
    merged.textAlign = ta;
  }
  if (td) {
    merged.textDecoration = td;
  }
  if (tt) {
    merged.textTransform = tt;
  }
  if (fs) {
    merged.fontStyle = fs;
  }
  if (ff) {
    merged.fontFamily =
      ff === "monospace"
        ? "ui-monospace, SFMono-Regular, menlo, monaco, consolas, monospace"
        : ff;
  }
  if (fw != null) {
    merged.fontWeight = fw;
  }
  if (inline) {
    merged.display = "inline";
  }
  if (lineClamp != null && lineClamp > 0) {
    merged.display = "-webkit-box";
    merged.WebkitLineClamp = lineClamp;
    merged.WebkitBoxOrient = "vertical";
    merged.overflow = "hidden";
  }
  if (truncate) {
    merged.overflow = "hidden";
    merged.textOverflow = "ellipsis";
    merged.whiteSpace = "nowrap";
  }

  const marginTop = spacingToCss(mt);
  const marginBottom = spacingToCss(mb);
  const marginLeft = spacingToCss(ml);
  const marginRight = spacingToCss(mr);
  const marginX = spacingToCss(mx);
  const paddingTop = spacingToCss(py);
  const paddingBottom = spacingToCss(py);
  const paddingLeft = spacingToCss(pl ?? px);
  const paddingRight = spacingToCss(pr ?? px);
  const paddingAll = spacingToCss(p);

  if (marginTop) {
    merged.marginTop = marginTop;
  }
  if (marginBottom) {
    merged.marginBottom = marginBottom;
  }
  if (marginLeft) {
    merged.marginLeft = marginLeft;
  }
  if (marginRight) {
    merged.marginRight = marginRight;
  }
  if (marginX) {
    merged.marginLeft = marginX;
    merged.marginRight = marginX;
  }
  if (paddingAll) {
    merged.padding = paddingAll;
  }
  if (paddingTop) {
    merged.paddingTop = paddingTop;
  }
  if (paddingBottom) {
    merged.paddingBottom = paddingBottom;
  }
  if (paddingLeft) {
    merged.paddingLeft = paddingLeft;
  }
  if (paddingRight) {
    merged.paddingRight = paddingRight;
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

export type AppTextComponent = "span" | "p" | "div" | "a" | "ul";

export function resolveTextElementType(
  component?: AppTextComponent,
  span?: boolean,
): "span" | "p" | "div" {
  if (component === "span" || component === "p" || component === "div") {
    return component;
  }
  if (span) {
    return "span";
  }
  return "p";
}

export function usesNativeTextElement(
  component?: AppTextComponent,
  href?: string,
): boolean {
  return component === "a" || component === "ul" || href != null;
}

export function buildBcdsTextClassName(
  size: BcdsTextSize,
  color: BcdsTextColor,
): string {
  return `bcds-react-aria-Text ${size} ${color}`;
}

export type BcdsHeadingColor = BcdsTextColor;

export function mapMantineTitleOrder(
  order: number | undefined,
): 1 | 2 | 3 | 4 | 5 | 6 {
  const level = order ?? 1;
  if (level < 1) {
    return 1;
  }
  if (level > 6) {
    return 6;
  }
  return level as 1 | 2 | 3 | 4 | 5 | 6;
}
