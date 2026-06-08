/**
 * Mantine-compatible spacing helpers without importing @mantine/core in adapters.
 */

/** Mirrors `appTheme.spacing` (BC DS layout margin tokens). */
const MANTINE_SPACING: Record<string, string> = {
  xs: "var(--layout-margin-xsmall)",
  sm: "var(--layout-margin-small)",
  md: "var(--layout-margin-medium)",
  lg: "var(--layout-margin-medium)",
  xl: "var(--layout-margin-medium)",
};

/** Matches Mantine `rem()` for numeric (px-scale) and theme spacing keys. */
export function rem(value: number | string): string {
  if (typeof value === "number") {
    return `${value / 16}rem`;
  }
  return MANTINE_SPACING[value] ?? value;
}

export function spacingToCss(
  value: number | string | undefined,
): string | undefined {
  if (value == null) {
    return undefined;
  }
  return rem(value);
}
