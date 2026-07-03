import { fireEvent, screen } from "@testing-library/react";

/**
 * Resolves a BC DS field wrapper (by test id) to its native input or textarea.
 */
export function getNativeInputWithin(
  testIdOrElement: string | HTMLElement,
): HTMLElement {
  const el =
    typeof testIdOrElement === "string"
      ? screen.getByTestId(testIdOrElement)
      : testIdOrElement;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el;
  }
  const inner = el.querySelector("input, textarea");
  if (inner == null) {
    throw new Error(
      `No native input found within field ${String(testIdOrElement)}`,
    );
  }
  return inner as HTMLElement;
}

/** Fires a change event on the native control inside a BC DS field wrapper. */
export function changeFieldValue(testId: string, value: string): void {
  const input = getNativeInputWithin(testId);
  fireEvent.change(input, { target: { value } });
  fireEvent.input(input, { target: { value } });
}
