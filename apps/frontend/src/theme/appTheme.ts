import { createTheme } from "../ui";

const blueScale: [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
] = [
  "#F1F8FE",
  "#D8EAFD",
  "#C1DDFC",
  "#A8D0FB",
  "#91C4FA",
  "#7AB8F9",
  "#5595D9",
  "#3470B1",
  "#1E5189",
  "#013366",
];

/** BC DS greyscale mapped to Mantine 10-shade arrays */
const grayScale: typeof blueScale = [
  "#FAF9F8",
  "#F3F2F1",
  "#ECEAE8",
  "#E0DEDC",
  "#D1CFCD",
  "#C6C5C3",
  "#9F9D9C",
  "#605E5C",
  "#3D3C3B",
  "#353433",
];

const redScale: typeof blueScale = [
  "#F4E1E2",
  "#E8C3C4",
  "#DCA5A6",
  "#D08788",
  "#CE3E39",
  "#A8322E",
  "#822623",
  "#5C1A18",
  "#360E0D",
  "#100202",
];

/**
 * Mantine spacing keys mapped to B.C. Design System layout margin tokens.
 * Tighter than Mantine defaults so Stack/Group gaps match gov.bc.ca density.
 *
 * | Mantine | BC token              | Size   |
 * |---------|------------------------|--------|
 * | xs      | layout-margin-xsmall   | 0.25rem |
 * | sm      | layout-margin-small    | 0.5rem  |
 * | md      | layout-margin-medium   | 1rem    |
 * | lg      | layout-margin-medium   | 1rem    |
 * | xl      | layout-margin-medium   | 1rem    |
 */
const bcdsSpacing = {
  xs: "var(--layout-margin-xsmall)",
  sm: "var(--layout-margin-small)",
  md: "var(--layout-margin-medium)",
  lg: "var(--layout-margin-medium)",
  xl: "var(--layout-margin-medium)",
} as const;

export const appTheme = createTheme({
  fontFamily:
    '"BC Sans", "Noto Sans", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  headings: {
    fontFamily:
      '"BC Sans", "Noto Sans", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  defaultRadius: "sm",
  primaryColor: "blue",
  colors: {
    blue: blueScale,
    gray: grayScale,
    red: redScale,
  },
  spacing: bcdsSpacing,
  other: {
    bodyBg: "var(--surface-color-background-light-gray)",
  },
});
