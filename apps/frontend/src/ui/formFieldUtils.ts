import type { ChangeEvent, CSSProperties, ReactNode } from "react";

export function mapMantineAlertVariant(
  color?: string,
  variant?: string,
): "info" | "success" | "warning" | "danger" {
  if (color === "red") return "danger";
  if (color === "green") return "success";
  if (color === "yellow" || color === "orange") return "warning";
  if (color === "gray" && variant === "light") return "info";
  if (color === "blue" || color === "cyan") return "info";
  return "info";
}

export function normalizeFieldError(
  error?: ReactNode | boolean,
): string | undefined {
  if (error === true) {
    return "Invalid value";
  }
  if (typeof error === "string" && error.length > 0) {
    return error;
  }
  return undefined;
}

export function isStringLabel(label: ReactNode): label is string {
  return typeof label === "string";
}

/** Mantine field spacing shorthands on wrappers */
export function fieldMarginStyle(
  mt?: string | number,
  mb?: string | number,
  ml?: string | number,
  mr?: string | number,
): CSSProperties {
  const toCss = (v: string | number | undefined): string | undefined => {
    if (v == null) return undefined;
    if (typeof v === "number") return `${v * 0.25}rem`;
    const map: Record<string, string> = {
      xs: "0.625rem",
      sm: "0.75rem",
      md: "1rem",
      lg: "1.25rem",
      xl: "2rem",
    };
    return map[v] ?? v;
  };
  return {
    marginTop: toCss(mt),
    marginBottom: toCss(mb),
    marginLeft: toCss(ml),
    marginRight: toCss(mr),
  };
}

export function emitInputChange(
  value: string,
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void,
): void {
  if (!onChange) return;
  onChange({
    currentTarget: { value },
    target: { value },
  } as ChangeEvent<HTMLInputElement>);
}

export function emitTextareaChange(
  value: string,
  onChange?: (event: ChangeEvent<HTMLTextAreaElement>) => void,
): void {
  if (!onChange) return;
  onChange({
    currentTarget: { value },
    target: { value },
  } as ChangeEvent<HTMLTextAreaElement>);
}

export function pickFieldPassthrough(
  rest: Record<string, unknown>,
): Record<string, unknown> {
  const passthrough: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (
      key.startsWith("data-") ||
      key.startsWith("aria-") ||
      key === "id" ||
      key === "name" ||
      key === "autoComplete" ||
      key === "autoFocus" ||
      key === "readOnly" ||
      key === "placeholder"
    ) {
      passthrough[key] = value;
    }
  }
  return passthrough;
}
