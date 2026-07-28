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

// Mock the Monaco surface with a plain <textarea>. The component passes
// through `value` / `onChange`; Monaco's marker decorations + the deno-
// runner-style language services don't fire in this stub, but the
// parse-strip behaviour is driven by the editor's text, not the gutter.
// D-13 — `CodePane` bundles Monaco locally and awaits the chunk before
// rendering `<Editor>`. Stub the loader so the 70 MB `monaco-editor` import
// never runs under jsdom; the editor surface itself is stubbed just below.
// Hoisted + per-test overridable so the failure surface can be exercised.
const ensureLocalMonacoMock = vi.hoisted(() =>
  vi.fn((): Promise<void> => Promise.resolve()),
);
vi.mock("./monaco-loader", () => ({
  ensureLocalMonaco: ensureLocalMonacoMock,
}));

vi.mock("@monaco-editor/react", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange?: (next: string | undefined) => void;
  }) => (
    <textarea
      data-testid="monaco-stub"
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
        onEditorUnavailable={props.onEditorUnavailable}
      />
    </MantineProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  ensureLocalMonacoMock.mockImplementation(() => Promise.resolve());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CodePane (US-177)", () => {
  // -----------------------------------------------------------------------
  // Scenario 2 — Boilerplate prefill in create mode
  // -----------------------------------------------------------------------
  it("seeds the editor with the boilerplate when `script` is empty", async () => {
    renderPane({ script: "" });
    // D-13 — the editor renders only after the local Monaco chunk resolves.
    const editor = (await screen.findByTestId(
      "monaco-stub",
    )) as HTMLTextAreaElement;
    expect(editor.value).toBe(DYNAMIC_NODE_BOILERPLATE);
  });

  // -----------------------------------------------------------------------
  // Scenario 2 (edit-mode hydrate) — receives `script` prop
  // -----------------------------------------------------------------------
  it("hydrates the editor from the `script` prop in edit mode", async () => {
    const script = `/** @workflow-node @name foo */ export default async () => ({});`;
    renderPane({ script });
    const editor = (await screen.findByTestId(
      "monaco-stub",
    )) as HTMLTextAreaElement;
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

    const editor = screen.getByTestId("monaco-stub") as HTMLTextAreaElement;
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

// ---------------------------------------------------------------------------
// D-13 — the editor's bring-up is bounded and its failure is visible.
//
// Before this, Monaco was fetched from cdn.jsdelivr.net at runtime. With the
// CDN blocked — an egress proxy, an air-gapped deploy — the pane sat on
// "Loading…" indefinitely and Publish stayed enabled, so an author could ship
// a script they had never been shown. Monaco is bundled locally now; these
// cover what happens when the bring-up still doesn't finish.
// ---------------------------------------------------------------------------
describe("CodePane — editor bring-up failure (D-13)", () => {
  it("surfaces an error and reports unavailable when the Monaco chunk fails to load", async () => {
    ensureLocalMonacoMock.mockImplementation(() =>
      Promise.reject(new Error("Failed to fetch dynamically imported module")),
    );
    const onEditorUnavailable = vi.fn();

    renderPane({ script: "", onEditorUnavailable });

    const alert = await screen.findByTestId("code-pane-editor-failed");
    expect(alert).toHaveTextContent(/failed to load/i);
    // Never silently degrades to an empty box: the editor is not rendered.
    expect(screen.queryByTestId("monaco-stub")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(onEditorUnavailable).toHaveBeenLastCalledWith(
        expect.stringContaining("failed to load"),
      );
    });
  });

  it("gives up after the mount timeout when the editor never reaches onMount", async () => {
    // The loader resolves, so `<Editor>` renders — but the stub never calls
    // `onMount`, standing in for an editor that hangs mid-init. This is the
    // exact shape of the old bug: no rejection to catch, just silence.
    const onEditorUnavailable = vi.fn();
    renderPane({ script: "", onEditorUnavailable });

    await screen.findByTestId("monaco-stub");
    expect(
      screen.queryByTestId("code-pane-editor-failed"),
    ).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });

    expect(screen.getByTestId("code-pane-editor-failed")).toBeInTheDocument();
    expect(onEditorUnavailable).toHaveBeenLastCalledWith(
      expect.stringContaining("failed to load"),
    );
  });

  // Deliberate: the transient loading window does NOT block Publish. What
  // gets published lives in React state, not in Monaco, so a click during
  // load publishes exactly what a click after load would. Only the terminal
  // failure above blocks.
  it("does not report unavailable during the normal loading window", async () => {
    const onEditorUnavailable = vi.fn();
    renderPane({ script: "", onEditorUnavailable });
    await screen.findByTestId("monaco-stub");
    expect(onEditorUnavailable).toHaveBeenLastCalledWith(null);
  });
});
