import type { ChangeEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  emitInputChange,
  emitTextareaChange,
  normalizeFieldError,
  resolveFieldAriaLabel,
} from "./formFieldUtils";

describe("normalizeFieldError", () => {
  it("maps true to a generic message", () => {
    expect(normalizeFieldError(true)).toBe("Invalid value");
  });

  it("returns non-empty strings", () => {
    expect(normalizeFieldError("Required")).toBe("Required");
  });

  it("returns undefined for empty or absent errors", () => {
    expect(normalizeFieldError(undefined)).toBeUndefined();
    expect(normalizeFieldError(false)).toBeUndefined();
    expect(normalizeFieldError("")).toBeUndefined();
  });
});

describe("resolveFieldAriaLabel", () => {
  it("returns undefined when a visible string label is present", () => {
    expect(
      resolveFieldAriaLabel("Name", "Enter name", { "aria-label": "Alt" }),
    ).toBeUndefined();
  });

  it("prefers explicit aria-label over placeholder", () => {
    expect(
      resolveFieldAriaLabel(undefined, "Search", {
        "aria-label": "Filter requests",
      }),
    ).toBe("Filter requests");
  });

  it("falls back to placeholder when unlabeled", () => {
    expect(resolveFieldAriaLabel(undefined, "Search…", {})).toBe("Search…");
  });

  it("returns undefined when no label, aria-label, or placeholder", () => {
    expect(resolveFieldAriaLabel(undefined, undefined, {})).toBeUndefined();
  });
});

describe("emitInputChange", () => {
  it("coerces string values into synthetic input events", () => {
    const onChange = vi.fn();
    emitInputChange("hello", onChange);
    const event = onChange.mock.calls[0]?.[0] as ChangeEvent<HTMLInputElement>;
    expect(event.currentTarget.value).toBe("hello");
  });
});

describe("emitTextareaChange", () => {
  it("coerces string values into synthetic textarea events", () => {
    const onChange = vi.fn();
    emitTextareaChange("notes", onChange);
    const event = onChange.mock
      .calls[0]?.[0] as ChangeEvent<HTMLTextAreaElement>;
    expect(event.currentTarget.value).toBe("notes");
  });
});
