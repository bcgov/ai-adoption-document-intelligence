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

import { parseDynamicNodeSignature } from "@ai-di/graph-workflow";
import { MantineProvider } from "@mantine/core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ReactFlow } from "@xyflow/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import parserSource from "../../../../../../packages/graph-workflow/src/dynamic-nodes/parse-signature.ts?raw";
import { DYNAMIC_NODE_BOILERPLATE } from "./boilerplate";
import { CodePane } from "./CodePane";

// Mock the Monaco surface with a plain <textarea>. The component passes
// through `value` / `onChange`; Monaco's marker decorations + the deno-
// runner-style language services don't fire in this stub, but the
// parse-strip behaviour is driven by the editor's text, not the gutter.
// `CodePane` bundles Monaco locally and awaits the chunk before
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
 * component depends on: the editor owns its buffer.
 *
 * So the stub is an *uncontrolled* `<textarea>` seeded once from
 * `defaultValue`, exactly as the real library creates its model from
 * `value || defaultValue` and then never re-reads `defaultValue`. React cannot
 * push text into it; the only way text changes after mount is the author
 * typing, or `CodePane` calling `editor.setValue()` through the handle it got
 * from `onMount`. That is what makes these tests able to fail: a stale echo
 * reaching the buffer shows up as a `setValue` that clobbers the textarea.
 *
 * A controlled `<textarea value={value}>` stub would pin the shape this
 * component must not have: with `value`, two keystrokes inside one React
 * commit make `value` trail the model, and the library replaces the whole
 * model and throws the caret to the end.
 *
 * `onMount` fires by default. `monacoStubMounts` turns it off for the one
 * test that stands in for an editor hanging mid-init.
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
    // The editor renders only after the local Monaco chunk resolves.
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
  // The strip owns exactly one half of the checking — the JSDoc header, not
  // the TypeScript — and has to say so. These pin that copy, in both states,
  // and the one concrete gesture that DOES turn it red: breaking the header.
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
// The editor's bring-up is bounded and its failure is visible.
//
// Monaco is bundled locally, but its chunk can still fail to load, or the
// editor hang mid-init. The pane must then say so rather than sit on
// "Loading…", and Publish must be refused: an author must never ship a script
// they have not been shown.
// ---------------------------------------------------------------------------
describe("CodePane — editor bring-up failure", () => {
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
    // `onMount`, standing in for an editor that hangs mid-init: no rejection
    // to catch, just silence.
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
// The parent's `script` prop is this pane's own text echoed back.
//
// The tests above pass a STATIC `script`, so the round-trip through the
// parent never happens in them. These use a controlled harness — the
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
// `.cursors-layer`. It covers three cases: select-all + delete stays deleted
// with the caret on the one empty line; 26 pause-and-resume typing cycles
// swept across the 150 ms debounce boundary leave every character and the
// caret on the line they were typed on; and two keystrokes inside a single
// React commit do not rewrite the model, which passing `defaultValue` rather
// than `value` guarantees.
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

describe("CodePane — the parent's echo must not overwrite the buffer", () => {
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

    // Without the echo guard, `script` echoes back as "", the effect re-seeds
    // from `script || DYNAMIC_NODE_BOILERPLATE`, and the entire boilerplate
    // reappears with the caret at its end — every time, no race needed.
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

    // Without the echo guard the stale echo (T_A) wins and the "3" is
    // discarded — and in real Monaco the whole model is replaced with
    // `forceMoveMarkers`, sending the caret to the end of the last line.
    //
    // This has teeth against the uncontrolled stub too: remove the echo
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

// ---------------------------------------------------------------------------
// The editor also opens over the builder canvas: the step list's "New custom
// node" window, and "Edit script" on a custom step.
//
// React Flow pans the canvas while Space is held. It listens for Space on the
// whole document and claims it with `preventDefault` unless the key comes from
// a text field or from inside an element carrying its `nokey` class. In
// Chromium, Monaco takes typing on a plain `div` (the EditContext API), which
// is not a text field, so every space typed into the editor over the canvas
// was swallowed. The keydown below starts on the editor's container, a plain
// `div` like Monaco's typing surface: the stub's `textarea` is a text field
// React Flow already ignores, so starting there would prove nothing. The
// browser-level proof is tier1-code-pane-canvas-keys.spec.ts.
// ---------------------------------------------------------------------------
describe("CodePane — open over the canvas", () => {
  it("leaves a space typed in the editor to the editor", async () => {
    render(
      <MantineProvider>
        <ReactFlow nodes={[]} edges={[]} />
        <CodePane script="" onChange={vi.fn()} />
      </MantineProvider>,
    );
    await screen.findByTestId("monaco-stub");

    const notClaimed = fireEvent.keyDown(
      screen.getByTestId("code-pane-editor"),
      { key: " ", code: "Space" },
    );

    expect(notClaimed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// "What is checked?" names every check the live parser makes.
//
// `parseDynamicNodeSignature` publishes no list of its own checks, so these
// read its source for every error message it can produce and require each one
// to be mapped to a line of the popover. A check added to the parser with no
// line fails the first test; a row whose probe no longer trips its check
// fails the second; a popover line that no check maps to, or a mapped line
// missing from the popover, fails the third.
// ---------------------------------------------------------------------------

/** The popover's "Checked here, as you type" lines, as rendered. */
const LIVE_LINES = {
  marker:
    "The top of the file has a /** … */ comment containing @workflow-node. Only imports, // comments and blank lines may come before it.",
  required:
    "@name, @description, @inputs and @outputs are all present, and @name and @description are not empty.",
  name: "@name starts with a lower-case letter and has only lower-case letters, digits and hyphens, up to 64 characters.",
  json: "The values of @inputs, @outputs, @parameters and @allowNet parse as JSON. Comments, unquoted keys and trailing commas are fine.",
  ports:
    '@inputs and @outputs map each port name to an object with a kind, like { doc: { kind: "Document" } }.',
  kinds:
    "Every input and output kind is one the system knows. Add [] for a list.",
  parameters:
    "@parameters, if present, maps each name to an object whose type is string, number, boolean or enum. An enum lists its values, as strings, in enum.",
  deterministic: "@deterministic, if present, is true or false.",
  numbers: "@timeoutMs and @maxMemoryMB, if present, are numbers.",
} as const;

const PROBE_TAGS = {
  marker: " * @workflow-node",
  name: " * @name probe-node",
  description: " * @description Probe",
  inputs: ' * @inputs { doc: { kind: "Document" } }',
  outputs: ' * @outputs { out: { kind: "Artifact" } }',
} as const;
const VALID_HEADER: string[] = Object.values(PROBE_TAGS);

function probeScript(headerLines: string[]): string {
  return [
    "/**",
    ...headerLines,
    " */",
    "export default async function dynamicNode() { return {}; }",
  ].join("\n");
}
/** A valid header with one more tag line at its end. */
const adding = (line: string) => probeScript([...VALID_HEADER, line]);
/** A valid header with one of its lines swapped for another. */
const swapping = (from: string, to: string) =>
  probeScript(VALID_HEADER.map((line) => (line === from ? to : line)));
/** A valid header with one of its lines left out. */
const dropping = (line: string) =>
  probeScript(VALID_HEADER.filter((l) => l !== line));

interface ParserCheck {
  /** The parser's message, with each `${…}` placeholder shown as `…`. */
  message: string;
  /** A script that fails this check. */
  probe: string;
  /** The popover line that covers it. */
  line: string;
}

const PARSER_CHECKS: ParserCheck[] = [
  {
    message: "Missing @workflow-node marker",
    probe: dropping(PROBE_TAGS.marker),
    line: LIVE_LINES.marker,
  },
  {
    message: "Missing required tag …",
    probe: dropping(PROBE_TAGS.description),
    line: LIVE_LINES.required,
  },
  {
    message: "@name must match /^[a-z][a-z0-9-]*$/ max 64 chars",
    probe: swapping(PROBE_TAGS.name, " * @name Probe_Node"),
    line: LIVE_LINES.name,
  },
  {
    message:
      "Invalid … value: expected a JSON object or array, got empty value",
    probe: adding(" * @parameters"),
    line: LIVE_LINES.json,
  },
  {
    message: "Invalid … value: …",
    probe: swapping(PROBE_TAGS.inputs, " * @inputs { doc: "),
    line: LIVE_LINES.json,
  },
  {
    message: "… must be an object mapping port names to { kind, ... }",
    probe: swapping(PROBE_TAGS.inputs, ' * @inputs ["doc"]'),
    line: LIVE_LINES.ports,
  },
  {
    message: '….… must be an object with at least a "kind" property',
    probe: swapping(PROBE_TAGS.inputs, ' * @inputs { doc: "Document" }'),
    line: LIVE_LINES.ports,
  },
  {
    message: '….… is missing a string "kind"',
    probe: swapping(
      PROBE_TAGS.inputs,
      " * @inputs { doc: { required: true } }",
    ),
    line: LIVE_LINES.ports,
  },
  {
    message: "Unknown kind: …",
    probe: swapping(
      PROBE_TAGS.inputs,
      ' * @inputs { doc: { kind: "NotARealKind" } }',
    ),
    line: LIVE_LINES.kinds,
  },
  {
    message:
      "@parameters must be an object mapping param names to { type, ... }",
    probe: adding(' * @parameters ["level"]'),
    line: LIVE_LINES.parameters,
  },
  {
    message: '@parameters.… must be an object with at least a "type" property',
    probe: adding(' * @parameters { level: "string" }'),
    line: LIVE_LINES.parameters,
  },
  {
    message:
      '@parameters.….type "…" is not supported (expected one of: string, number, boolean, enum)',
    probe: adding(' * @parameters { level: { type: "date" } }'),
    line: LIVE_LINES.parameters,
  },
  {
    message: '@parameters.….type is "enum" but no "enum" array was provided',
    probe: adding(' * @parameters { level: { type: "enum" } }'),
    line: LIVE_LINES.parameters,
  },
  {
    message: "@parameters.….enum must be an array of strings",
    probe: adding(' * @parameters { level: { type: "enum", enum: [1, 2] } }'),
    line: LIVE_LINES.parameters,
  },
  {
    message:
      'Invalid @deterministic value: expected "true" or "false", got "…"',
    probe: adding(" * @deterministic yes"),
    line: LIVE_LINES.deterministic,
  },
  {
    message: 'Invalid … value: expected a number, got "…"',
    probe: adding(" * @timeoutMs soon"),
    line: LIVE_LINES.numbers,
  },
];

/**
 * Every error message `parse-signature.ts` sets, as `ParserCheck.message`
 * spells it: the string or template literal after `message:`, without its
 * quotes, each `${…}` placeholder shown as `…`.
 */
function parserMessages(): string[] {
  const found = new Set<string>();
  for (const match of parserSource.matchAll(/message:\s*(`[^`]*`|"[^"]*")/g)) {
    found.add(match[1].slice(1, -1).replace(/\$\{[^}]*\}/g, "…"));
  }
  return [...found].sort();
}

/** A `ParserCheck.message` as a pattern in which each `…` matches any text. */
function messagePattern(message: string): RegExp {
  const parts = message
    .split("…")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${parts.join(".*")}$`);
}

describe('CodePane — "What is checked?" covers every check the parser makes', () => {
  it("maps every error the parser can report to a line", () => {
    const mapped = PARSER_CHECKS.map((check) => check.message).sort();
    // A parser message missing from PARSER_CHECKS is a check the popover
    // does not mention: add its line to STRIP_LIVE_CHECKS in CodePane.tsx,
    // then a row here.
    expect(mapped).toEqual(parserMessages());
  });

  it.each(PARSER_CHECKS)("$message — its probe trips that check", (check) => {
    const { errors } = parseDynamicNodeSignature(check.probe);
    const pattern = messagePattern(check.message);
    expect(
      errors.map((e) => e.message).filter((m) => pattern.test(m)),
      `no error matched; the parser said: ${errors.map((e) => e.message).join(" | ")}`,
    ).not.toHaveLength(0);
  });

  it("shows exactly the lines those checks map to", async () => {
    renderPane({ script: "" });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.click(
      (await screen.findAllByTestId("code-pane-strip-checks-trigger"))[0],
    );
    const live = await screen.findByTestId("code-pane-strip-checks-live");
    // Read the items directly: while the dropdown fades in, role queries
    // treat them as hidden.
    const shown = Array.from(live.querySelectorAll("li"))
      .map((item) => item.textContent ?? "")
      .sort();
    const mapped = [
      ...new Set(PARSER_CHECKS.map((check) => check.line)),
    ].sort();
    expect(shown).toEqual(mapped);
  });
});
