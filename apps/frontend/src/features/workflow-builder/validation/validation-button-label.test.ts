import { describe, expect, it } from "vitest";
import { validationButtonState } from "./validation-button-label";

describe("validationButtonState — severity is not summed (G-097)", () => {
  it("names errors and warnings separately when both are present", () => {
    // The regression: this used to read "6 issues" in red.
    expect(validationButtonState(1, 5)).toEqual({
      tone: "red",
      label: "1 error · 5 warnings",
    });
  });

  it("reports only errors when there are no warnings", () => {
    expect(validationButtonState(2, 0)).toEqual({
      tone: "red",
      label: "2 errors",
    });
  });

  it("is yellow and warning-only when there are no errors", () => {
    expect(validationButtonState(0, 3)).toEqual({
      tone: "yellow",
      label: "3 warnings",
    });
  });

  it("is green when the graph is clean", () => {
    expect(validationButtonState(0, 0)).toEqual({
      tone: "green",
      label: "Valid",
    });
  });

  it("singularises both counts", () => {
    expect(validationButtonState(1, 0).label).toBe("1 error");
    expect(validationButtonState(0, 1).label).toBe("1 warning");
    expect(validationButtonState(1, 1).label).toBe("1 error · 1 warning");
  });

  it("never reports a count larger than the severity it is coloured for", () => {
    // Guards the actual defect shape: red must not borrow the warning count.
    const { label } = validationButtonState(1, 5);
    expect(label).not.toContain("6");
  });
});
