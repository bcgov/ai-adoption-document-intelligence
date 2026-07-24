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

/**
 * Resolves an accessible name for BC DS fields when no visible string label is present.
 * Call sites may pass `aria-label` explicitly or rely on placeholder text.
 */
export function resolveFieldAriaLabel(
  label: ReactNode | undefined,
  placeholder: string | undefined,
  passthrough: Record<string, unknown>,
): string | undefined {
  if (isStringLabel(label)) {
    return undefined;
  }
  const explicit = passthrough["aria-label"];
  if (typeof explicit === "string" && explicit.length > 0) {
    return explicit;
  }
  if (placeholder != null && placeholder.length > 0) {
    return placeholder;
  }
  return undefined;
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

function coerceFieldValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value != null && typeof value === "object" && "nativeEvent" in value) {
    const { currentTarget } = value as ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement
    >;
    if (
      currentTarget instanceof HTMLInputElement ||
      currentTarget instanceof HTMLTextAreaElement
    ) {
      return currentTarget.value;
    }
    const plain = currentTarget as { value?: string };
    if (typeof plain?.value === "string") {
      return plain.value;
    }
  }
  return value == null ? "" : String(value);
}

function syntheticInputEvent(value: string): ChangeEvent<HTMLInputElement> {
  const input = document.createElement("input");
  input.value = value;
  return {
    currentTarget: input,
    target: input,
    nativeEvent: new Event("input"),
  } as ChangeEvent<HTMLInputElement>;
}

function syntheticTextareaEvent(
  value: string,
): ChangeEvent<HTMLTextAreaElement> {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  return {
    currentTarget: textarea,
    target: textarea,
    nativeEvent: new Event("input"),
  } as ChangeEvent<HTMLTextAreaElement>;
}

/**
 * Notifies Mantine form `getInputProps` and `e.currentTarget.value` handlers.
 * Uses a real `HTMLInputElement` so Mantine does not store the event object as the value.
 */
export function emitInputChange(
  value: unknown,
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void,
): void {
  if (!onChange) return;
  onChange(syntheticInputEvent(coerceFieldValue(value)));
}

export function emitTextareaChange(
  value: unknown,
  onChange?: (event: ChangeEvent<HTMLTextAreaElement>) => void,
): void {
  if (!onChange) return;
  onChange(syntheticTextareaEvent(coerceFieldValue(value)));
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
