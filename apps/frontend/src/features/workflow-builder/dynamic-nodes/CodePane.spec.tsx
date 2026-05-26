/**
 * Tests for `CodePane` (Phase 6 US-177).
 *
 * The CodeMirror surface is stubbed (jsdom can't run its full DOM
 * gutter); the tests assert prop wiring + the strip's render contract
 * against the stubbed editor's value. The live parse strip + the
 * publish-error gutter routing are exercised through the parser
 * (real, client-side) — that's the contract that ships.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DYNAMIC_NODE_BOILERPLATE } from "./boilerplate";
import { CodePane } from "./CodePane";

// Mock the CodeMirror surface with a plain <textarea>. The component
// passes through `value` / `onChange` / `ref`; the linter / gutter
// extensions don't fire in this stub but the parse-strip behaviour is
// driven by the editor's text, not the gutter.
vi.mock("@uiw/react-codemirror", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange?: (next: string) => void;
  }) => (
    <textarea
      data-testid="codemirror-stub"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

function renderPane(props: Partial<Parameters<typeof CodePane>[0]>) {
  const onChange = props.onChange ?? vi.fn();
  return render(
    <MantineProvider>
      <CodePane
        script={props.script ?? ""}
        onChange={onChange}
        publishErrors={props.publishErrors}
      />
    </MantineProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CodePane (US-177)", () => {
  // -----------------------------------------------------------------------
  // Scenario 2 — Boilerplate prefill in create mode
  // -----------------------------------------------------------------------
  it("seeds the editor with the boilerplate when `script` is empty", () => {
    renderPane({ script: "" });
    const editor = screen.getByTestId("codemirror-stub") as HTMLTextAreaElement;
    expect(editor.value).toBe(DYNAMIC_NODE_BOILERPLATE);
  });

  // -----------------------------------------------------------------------
  // Scenario 2 (edit-mode hydrate) — receives `script` prop
  // -----------------------------------------------------------------------
  it("hydrates the editor from the `script` prop in edit mode", () => {
    const script = `/** @workflow-node @name foo */ export default async () => ({});`;
    renderPane({ script });
    const editor = screen.getByTestId("codemirror-stub") as HTMLTextAreaElement;
    expect(editor.value).toBe(script);
  });

  // -----------------------------------------------------------------------
  // Scenario 3 — live parse strip shows OK for a well-formed boilerplate
  // -----------------------------------------------------------------------
  it("shows the green Signature OK strip when the boilerplate parses", async () => {
    renderPane({ script: "" });
    // Boilerplate parses cleanly — after the 300ms debounce, the strip
    // should render the OK alert.
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await waitFor(() => {
      expect(screen.getByTestId("code-pane-strip-ok")).toBeInTheDocument();
    });
    expect(screen.getByText(/Signature OK/i)).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Scenario 3 — live parse strip shows red errors on malformed input
  // -----------------------------------------------------------------------
  it("renders red error lines when the script has no @workflow-node marker", async () => {
    renderPane({ script: "// just a comment\nexport default () => null;" });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await waitFor(() => {
      expect(screen.getByTestId("code-pane-strip-errors")).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 5 — onChange fires (debounced) when the editor updates
  // -----------------------------------------------------------------------
  it("propagates the editor's text through `onChange` (debounced 150ms)", async () => {
    const onChange = vi.fn();
    renderPane({ script: "", onChange });
    // Initial onChange fires for the seed value after the debounce.
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(onChange).toHaveBeenCalledWith(DYNAMIC_NODE_BOILERPLATE);

    const editor = screen.getByTestId("codemirror-stub") as HTMLTextAreaElement;
    onChange.mockClear();
    await act(async () => {
      fireEvent.change(editor, { target: { value: "// new text" } });
      vi.advanceTimersByTime(200);
    });
    expect(onChange).toHaveBeenCalledWith("// new text");
  });

  // -----------------------------------------------------------------------
  // Scenario 4 — publishErrors prop is consumed (component doesn't crash)
  // -----------------------------------------------------------------------
  it("accepts a `publishErrors` prop without crashing", () => {
    renderPane({
      script: DYNAMIC_NODE_BOILERPLATE,
      publishErrors: [
        {
          stage: "ts-check",
          message: "Type mismatch",
          line: 5,
          column: 3,
        },
      ],
    });
    expect(screen.getByTestId("code-pane-editor")).toBeInTheDocument();
  });
});
