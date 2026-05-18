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
  "#e7f2fb",
  "#d0e5f7",
  "#a5ceef",
  "#77b6e7",
  "#4d9fdf",
  "#2489d6",
  "#036",
  "#002b59",
  "#00254d",
  "#001f40",
];

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
  },
});
