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
import { useState } from "react";
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

/**
 * The Monaco stub mirrors the ONE property of `@monaco-editor/react` this
 * component now depends on: the editor owns its buffer.
 *
 * So the stub is an *uncontrolled* `<textarea>` seeded once from
 * `defaultValue`, exactly as the real library creates its model from
 * `value || defaultValue` and then never re-reads `defaultValue`. React cannot
 * push text into it; the only way text changes after mount is the author
 * typing, or `CodePane` calling `editor.setValue()` through the handle it got
 * from `onMount`. That is what makes these tests able to fail: a stale echo
 * reaching the buffer now shows up as a `setValue` that clobbers the textarea.
 *
 * A previous version of this stub was `<textarea value={value}>`, which pinned
 * the controlled shape that caused D8's second cause — two keystrokes inside
 * one React commit made `value` trail the model and the library replaced the
 * whole model, throwing the caret to the end. Pinning it here would have made
 * the fix look like a regression.
 *
 * `onMount` fires by default. `monacoStubMounts` turns it off for the one
 * D-13 test that stands in for an editor hanging mid-init.
 */
const monacoStubMounts = vi.hoisted(() => ({ current: true }));

vi.mock("@monaco-editor/react", async () => {
  const { useEffect, useRef } = await import("react");
  return {
    default: ({
      defaultValue,
      onChange,
      onMount,
    }: {
      defaultValue?: string;
      onChange?: (next: string | undefined) => void;
      onMount?: (
        editor: {
          getValue: () => string;
          setValue: (next: string) => void;
          getModel: () => unknown;
          focus: () => void;
          setPosition: (position: unknown) => void;
          revealPositionInCenter: (position: unknown) => void;
        },
        monaco: {
          editor: { setModelMarkers: (...args: unknown[]) => void };
          MarkerSeverity: { Error: number };
          languages: {
            typescript: {
              typescriptDefaults: {
                setDiagnosticsOptions: (options: unknown) => void;
              };
            };
          };
        },
      ) => void;
    }) => {
      const nodeRef = useRef<HTMLTextAreaElement | null>(null);
      const mountedRef = useRef(false);

      useEffect(() => {
        const node = nodeRef.current;
        if (!node || mountedRef.current || !monacoStubMounts.current) return;
        mountedRef.current = true;
        onMount?.(
          {
            getValue: () => node.value,
            // Imperative, like the real editor: React does not know this
            // happened, and the DOM node is the buffer.
            setValue: (next: string) => {
              node.value = next;
            },
            getModel: () => ({
              getLineCount: () => node.value.split("\n").length,
              getLineMaxColumn: (line: number) =>
                (node.value.split("\n")[line - 1] ?? "").length + 1,
            }),
            focus: () => {
              /* the stub has no cursor or markers to move */
            },
            setPosition: () => {
              /* the stub has no cursor or markers to move */
            },
            revealPositionInCenter: () => {
              /* the stub has no cursor or markers to move */
            },
          },
          {
            editor: {
              setModelMarkers: () => {
                /* markers are Monaco's own UI — nothing to draw in a stub */
              },
            },
            MarkerSeverity: { Error: 8 },
            languages: {
              typescript: {
                typescriptDefaults: {
                  setDiagnosticsOptions: () => {
                    /* no TypeScript service under jsdom to configure */
                  },
                },
              },
            },
          },
        );
      });

      return (
        <textarea
          data-testid="monaco-stub"
          ref={nodeRef}
          defaultValue={defaultValue}
          onChange={(e) => onChange?.(e.target.value)}
        />
      );
    },
  };
});

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
  monacoStubMounts.current = true;
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
  // D26 — "Couldn't get it to turn red. What's it looking for?"
  //
  // The strip owns exactly one half of the checking, and never said which.
  // These pin the copy that now says so, in both states, and pin the one
  // concrete gesture that DOES turn it red — breaking the JSDoc header, not
  // the TypeScript.
  // -----------------------------------------------------------------------
  it("says what the green strip checked, and offers the full list", async () => {
    renderPane({ script: "" });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    const strip = await screen.findByTestId("code-pane-strip-ok");
    expect(strip).toHaveTextContent(
      "this strip checks that, not the TypeScript below it",
    );
    expect(
      screen.getAllByTestId("code-pane-strip-checks-trigger").length,
    ).toBeGreaterThan(0);
  });

  it("names the count and the block when the header is broken", async () => {
    // A valid header with an unknown kind: the TypeScript is irrelevant, the
    // `signature-semantics` stage is what fails.
    renderPane({
      script: [
        "/**",
        " * @workflow-node",
        " * @name broken-node",
        " * @description does not matter",
        ' * @inputs { doc: { kind: "NotARealKind" } }',
        ' * @outputs { out: { kind: "Artifact" } }',
        " */",
        "export default async function dynamicNode() { return {}; }",
      ].join("\n"),
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    const strip = await screen.findByTestId("code-pane-strip-errors");
    expect(strip).toHaveTextContent(
      "Signature not valid — 1 problem in the @workflow-node comment block",
    );
    expect(screen.getByTestId("code-pane-strip-error-0")).toHaveTextContent(
      "Unknown kind: NotARealKind",
    );
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
    monacoStubMounts.current = false;
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

// ---------------------------------------------------------------------------
// D8 — the parent's `script` prop is this pane's own text echoed back.
//
// The existing tests above pass a STATIC `script`, so the round-trip that
// causes the bug never happens in them. These use a controlled harness — the
// parent holds `script` in state and feeds it straight back — which is what
// `DynamicNodeEditor` does (`<CodePane script={currentText}
// onChange={setCurrentText} />`).
//
// Note what these CANNOT prove: the caret. jsdom has no rendered caret, and
// the stub's `setValue` is a DOM assignment rather than Monaco's model
// replacement. So these tests own the TEXT half — that the buffer survives the
// echo, that clearing sticks, and that a genuine external re-seed still lands.
//
// The caret half is owned by
// `tests/e2e/workflow-builder/specs/tier1-code-pane-caret.spec.ts`, which drives
// real Monaco in Chromium and reads the caret's line out of the rendered
// `.cursors-layer`. It covers all three defects: select-all + delete stays
// deleted with the caret on the one empty line; 26 pause-and-resume typing
// cycles swept across the 150 ms debounce boundary leave every character and
// the caret on the line they were typed on; and two keystrokes inside a single
// React commit no longer rewrite the model, which is what the move off the
// controlled `value` prop closed.
// ---------------------------------------------------------------------------

function ControlledCodePane({
  initialScript,
  echoDelayMs = 0,
}: {
  initialScript: string;
  /** Models the parent's own work (a full TS signature parse) before the echo. */
  echoDelayMs?: number;
}) {
  const [script, setScript] = useState(initialScript);
  return (
    <MantineProvider>
      <CodePane
        script={script}
        onChange={(next) => {
          if (echoDelayMs === 0) setScript(next);
          else setTimeout(() => setScript(next), echoDelayMs);
        }}
      />
    </MantineProvider>
  );
}

describe("CodePane — D8: the parent's echo must not overwrite the buffer", () => {
  it("clearing the editor stays cleared — it does not re-insert the boilerplate", async () => {
    render(<ControlledCodePane initialScript="const x = 1;" />);
    const editor = (await screen.findByTestId(
      "monaco-stub",
    )) as HTMLTextAreaElement;

    fireEvent.change(editor, { target: { value: "" } });
    // Past the 150 ms onChange debounce and the parent's echo back down.
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    // Before the fix: `script` echoes back as "", the effect re-seeds from
    // `script || DYNAMIC_NODE_BOILERPLATE`, and the entire boilerplate
    // reappears with the caret at its end. 100% reproducible, no race needed.
    await waitFor(() => expect(editor.value).toBe(""));
  });

  it("keeps characters typed while the previous commit is still echoing back", async () => {
    // REAL timers on purpose. The race is between the 150 ms onChange
    // debounce and the parent's echo landing, and fake timers collapse the
    // two into the same tick — under `advanceTimersByTime` the echo has
    // always already arrived by the time the next keystroke is delivered, so
    // the window the bug lives in never opens.
    vi.useRealTimers();
    const sleep = (ms: number) =>
      act(() => new Promise((resolve) => setTimeout(resolve, ms)));

    render(
      <ControlledCodePane initialScript="const x = 1;" echoDelayMs={200} />,
    );
    const editor = (await screen.findByTestId(
      "monaco-stub",
    )) as HTMLTextAreaElement;

    // T_A. Its debounce fires at ~150 ms, and the parent takes 200 ms more to
    // hand it back — the echo lands at ~350 ms.
    fireEvent.change(editor, { target: { value: "const x = 12;" } });
    await sleep(250);
    // Keep typing INSIDE that window, exactly as pausing between words does.
    fireEvent.change(editor, { target: { value: "const x = 123;" } });
    await sleep(700);

    // Before the fix the stale echo (T_A) won and the "3" was discarded —
    // and in real Monaco the whole model was replaced with `forceMoveMarkers`,
    // sending the caret to the end of the last line.
    //
    // This still has teeth against the uncontrolled stub: remove the echo
    // guard and `reseedEditor` calls `setValue("const x = 12;")` on the
    // handle it got from `onMount`, which overwrites the textarea directly.
    expect(editor.value).toBe("const x = 123;");
  });

  it("still accepts a genuine external re-seed (a revert pushing new text in)", async () => {
    function Harness() {
      const [script, setScript] = useState("const x = 1;");
      return (
        <MantineProvider>
          <CodePane script={script} onChange={setScript} />
          <button
            type="button"
            data-testid="external-reseed"
            onClick={() => setScript("// reverted")}
          >
            reseed
          </button>
        </MantineProvider>
      );
    }
    render(<Harness />);
    const editor = (await screen.findByTestId(
      "monaco-stub",
    )) as HTMLTextAreaElement;

    fireEvent.change(editor, { target: { value: "const x = 2;" } });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.click(screen.getByTestId("external-reseed"));
    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    await waitFor(() => expect(editor.value).toBe("// reverted"));
  });
});
