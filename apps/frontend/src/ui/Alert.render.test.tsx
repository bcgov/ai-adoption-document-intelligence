import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Alert } from "./Alert";

/**
 * Renders the real BC DS InlineAlert (no mock), so these tests see what the
 * user sees: the text inside the alert's visible container.
 */
function visibleText(container: HTMLElement): string {
  return (
    container.querySelector(".bcds-Inline-Alert--container")?.textContent ?? ""
  );
}

describe("Alert visible content", () => {
  it("shows a string title and a string body", () => {
    const { container } = render(
      <Alert title="Important" color="yellow">
        This is the only time you will see this key.
      </Alert>,
    );
    const text = visibleText(container);
    expect(text).toContain("Important");
    expect(text).toContain("This is the only time you will see this key.");
  });

  it("shows a string body with no title", () => {
    const { container } = render(
      <Alert color="red">Failed to check setup status.</Alert>,
    );
    expect(visibleText(container)).toContain("Failed to check setup status.");
  });

  it("shows a string title together with a ReactNode body", () => {
    const { container } = render(
      <Alert title="Heads up" color="blue">
        <strong>Bold</strong> detail
      </Alert>,
    );
    const text = visibleText(container);
    expect(text).toContain("Heads up");
    expect(text).toContain("Bold detail");
  });

  it("shows a ReactNode title with a string body", () => {
    const { container } = render(
      <Alert title={<em>Custom title</em>} color="green">
        Saved
      </Alert>,
    );
    const text = visibleText(container);
    expect(text).toContain("Custom title");
    expect(text).toContain("Saved");
  });
});
