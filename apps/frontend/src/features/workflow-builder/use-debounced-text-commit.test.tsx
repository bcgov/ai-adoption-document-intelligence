/**
 * Tests for `useDebouncedTextCommit` (D7).
 *
 * The hook exists to stop one keystroke costing one whole-graph config
 * rewrite, and the thing that makes it safe is the echo guard — the parent's
 * `value` arrives late and IS the draft coming back, so re-seeding from it
 * would overwrite whatever was typed in between. That is the bug D8 is, in the
 * Monaco editor; these tests pin the guard down here.
 */

import "@testing-library/jest-dom";

import { act, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useDebouncedTextCommit } from "./use-debounced-text-commit";

/**
 * A harness shaped like the real thing: the PARENT owns the value and the
 * field is controlled by it, so the value the field renders is its own text
 * echoed back through the parent one commit later.
 */
function ControlledHarness({
  onCommit,
  echoDelayMs = 0,
  initial = "",
}: {
  onCommit: (next: string) => void;
  /** Models the parent's own work between our commit and the value coming back. */
  echoDelayMs?: number;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  const { draft, setDraft, flush } = useDebouncedTextCommit(
    value,
    (next) => {
      onCommit(next);
      if (echoDelayMs === 0) setValue(next);
      else setTimeout(() => setValue(next), echoDelayMs);
    },
    50,
  );
  return (
    <div>
      <input
        data-testid="field"
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={flush}
      />
      <span data-testid="parent-value">{value}</span>
      <button
        type="button"
        data-testid="external-write"
        onClick={() => setValue("from-elsewhere")}
      >
        external
      </button>
    </div>
  );
}

function typeChars(text: string) {
  const field = screen.getByTestId("field") as HTMLInputElement;
  for (let i = 1; i <= text.length; i++) {
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(field, text.slice(0, i));
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  return field;
}

describe("useDebouncedTextCommit (D7)", () => {
  it("commits ONCE for a burst of keystrokes, not once per character", async () => {
    const onCommit = vi.fn();
    render(<ControlledHarness onCommit={onCommit} />);

    const field = typeChars("preparedItem");

    // Nothing has reached the parent yet — the field is still fully responsive
    // and shows every character.
    expect(onCommit).not.toHaveBeenCalled();
    expect(field.value).toBe("preparedItem");

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit).toHaveBeenCalledWith("preparedItem");
    // 12 characters, 1 commit. Before this hook it was 12 commits — each one a
    // new workflow config, a full auto-wire graph walk and a canvas
    // re-projection.
    expect("preparedItem".length).toBe(12);
  });

  it("does not lose characters typed while the parent is echoing the previous commit", async () => {
    // The D8 race, reproduced at unit level: the parent takes 30 ms to hand
    // the value back, and the author keeps typing inside that window. Without
    // the echo guard the late value wins and the characters typed in between
    // are discarded.
    const onCommit = vi.fn();
    render(<ControlledHarness onCommit={onCommit} echoDelayMs={30} />);

    typeChars("abc");
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith("abc"));
    // Keep typing while "abc" is still in flight back to us.
    const field = typeChars("abcdef");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    expect(field.value).toBe("abcdef");
    expect(screen.getByTestId("parent-value")).toHaveTextContent("abcdef");
  });

  it("clearing the field stays cleared — the echo does not restore the old text", async () => {
    const onCommit = vi.fn();
    render(<ControlledHarness onCommit={onCommit} initial="documentId" />);

    const field = typeChars("");
    // `typeChars("")` is a no-op; clear explicitly.
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(field, "");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(""));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    expect(field.value).toBe("");
  });

  it("still accepts a genuine external change (an undo, an agent write)", async () => {
    const onCommit = vi.fn();
    render(<ControlledHarness onCommit={onCommit} />);

    typeChars("mine");
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith("mine"));

    act(() => {
      screen.getByTestId("external-write").click();
    });

    await waitFor(() =>
      expect((screen.getByTestId("field") as HTMLInputElement).value).toBe(
        "from-elsewhere",
      ),
    );
  });

  it("flushes a pending commit on blur", async () => {
    const onCommit = vi.fn();
    render(<ControlledHarness onCommit={onCommit} />);

    const field = typeChars("quick");
    expect(onCommit).not.toHaveBeenCalled();
    act(() => {
      // React's onBlur is delegated from the bubbling `focusout` event.
      field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(onCommit).toHaveBeenCalledExactlyOnceWith("quick");
  });

  it("flushes a pending commit on unmount, so navigating away cannot drop it", async () => {
    const onCommit = vi.fn();
    const { unmount } = render(<ControlledHarness onCommit={onCommit} />);

    typeChars("half-typed");
    expect(onCommit).not.toHaveBeenCalled();
    unmount();
    expect(onCommit).toHaveBeenCalledExactlyOnceWith("half-typed");
  });
});
