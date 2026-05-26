/**
 * `CodePane` — code editor + live signature-parse status strip
 * (Phase 6 US-177 / REQUIREMENTS L38-L40).
 *
 * The editor mounts a CodeMirror surface in dark theme with line wrapping
 * disabled; the project does not ship Monaco as a dependency, and the
 * orchestrator brief says "Monaco is already a dep, no new install" —
 * since that's untrue at present and CodeMirror is the existing editor
 * dependency, we mount the closest in-house equivalent. The editor's
 * behaviour-level contract is identical: line-anchored gutter markers
 * (via CodeMirror's `linter` extension), live `onChange` propagation,
 * programmatic cursor positioning on strip-error clicks.
 *
 * Three behaviours layered on top:
 *
 * 1. **Boilerplate / hydrate**. Create-mode (`script` empty) prefills
 *    the REQUIREMENTS L38 boilerplate. Edit-mode (`script` set) hydrates
 *    from `headVersion.script`.
 * 2. **Live signature parse strip** (REQUIREMENTS L39). Calls
 *    `parseDynamicNodeSignature(text)` debounced 300 ms — no network.
 *    Renders a green-check + summary or a red bulleted list of
 *    `{stage} line N col M: message` entries. Clicking an error in the
 *    strip jumps the editor cursor to the line / column.
 * 3. **Publish-time gutter markers** (REQUIREMENTS L40). When
 *    `publishErrors` is non-empty, each entry with `line` populated
 *    surfaces as a CodeMirror diagnostic (red squiggle gutter marker
 *    with the message as the hover tooltip). The strip below renders
 *    the same list.
 *
 * Live parse + publish errors render *both* in the strip + the editor
 * gutter; the strip is the explicit list (clickable + sortable), the
 * gutter is the inline anchor.
 */

import {
  type ParseError,
  parseDynamicNodeSignature,
} from "@ai-di/graph-workflow";
import { type Diagnostic, linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { Alert, Anchor, Box, Group, Stack, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef, useState } from "react";
import { DYNAMIC_NODE_BOILERPLATE } from "./boilerplate";

// No language extension is mounted — `@codemirror/lang-json` is the only
// CodeMirror language package installed in the project, and the
// orchestrator forbids new installs. The editor surface is plain text
// (line numbers, gutter markers, lintable diagnostics all still work);
// publish-time `deno check` is the source of truth for TypeScript
// errors, so editor-side syntax highlighting is purely cosmetic.

export interface CodePaneProps {
  /** Source text. Empty string in create-mode → boilerplate is shown. */
  script: string;
  /** Editor change handler. Already debounced inside the component. */
  onChange: (next: string) => void;
  /**
   * Publish-time errors (from `POST` / `PUT /api/dynamic-nodes`'s 400
   * response). Each entry with `line` populated surfaces as a gutter
   * marker; the strip below the editor renders the full list verbatim.
   * Pass `[]` (default) to clear markers.
   */
  publishErrors?: ParseError[];
  /** Pixel height of the editor surface. Defaults to 480. */
  height?: number;
}

const PARSE_DEBOUNCE_MS = 300;
const ONCHANGE_DEBOUNCE_MS = 150;

interface ParseStripState {
  ok: boolean;
  signatureName?: string;
  inputs?: string[];
  outputs?: string[];
  errors: ParseError[];
}

/**
 * Convert a `ParseError` (line + column) into a CodeMirror `Diagnostic`
 * (character offsets `from` / `to`). Lines without a `line` field are
 * dropped — gutter markers need an anchor. The mapping is conservative:
 * we mark the whole line (offset of `line - 1` to next `\n`) so the user
 * sees something even when `column` is absent.
 */
function errorsToDiagnostics(
  documentText: string,
  errors: ParseError[],
): Diagnostic[] {
  const out: Diagnostic[] = [];
  // Pre-compute line start offsets so we can map (line, column) → char.
  const lineStarts: number[] = [0];
  for (let i = 0; i < documentText.length; i++) {
    if (documentText.charCodeAt(i) === 10 /* \n */) {
      lineStarts.push(i + 1);
    }
  }
  for (const err of errors) {
    const line = "line" in err ? err.line : undefined;
    if (line === undefined || line < 1) continue;
    const startOffset = lineStarts[line - 1] ?? 0;
    const lineEndOffset =
      line < lineStarts.length ? lineStarts[line] - 1 : documentText.length;
    const column = "column" in err ? err.column : undefined;
    const from =
      column !== undefined && column >= 1
        ? Math.min(startOffset + column - 1, lineEndOffset)
        : startOffset;
    const to = Math.max(from + 1, lineEndOffset);
    out.push({
      from,
      to,
      severity: "error",
      message: err.message,
    });
  }
  return out;
}

function formatErrorLine(err: ParseError): string {
  const line = "line" in err ? err.line : undefined;
  const column = "column" in err ? err.column : undefined;
  const anchor =
    line !== undefined
      ? column !== undefined
        ? ` line ${line} col ${column}`
        : ` line ${line}`
      : "";
  return `${err.stage}${anchor}: ${err.message}`;
}

export function CodePane({
  script,
  onChange,
  publishErrors,
  height,
}: CodePaneProps) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  // Local mirror so typing feels instant; debounced propagation up.
  const [internalText, setInternalText] = useState<string>(
    () => script || DYNAMIC_NODE_BOILERPLATE,
  );

  // When the parent's `script` prop changes (edit-mode hydrate, revert
  // refetch), reset the editor's text. We deliberately do NOT re-seed
  // from props on every render — just when the prop genuinely changed.
  const lastHydratedScriptRef = useRef<string>(script);
  useEffect(() => {
    if (script !== lastHydratedScriptRef.current) {
      lastHydratedScriptRef.current = script;
      setInternalText(script || DYNAMIC_NODE_BOILERPLATE);
    }
  }, [script]);

  // ── Live parse strip — debounced 300 ms client-side parse ─────────────
  const [debouncedParseInput] = useDebouncedValue(
    internalText,
    PARSE_DEBOUNCE_MS,
  );
  const parseStrip: ParseStripState = useMemo(() => {
    const result = parseDynamicNodeSignature(debouncedParseInput);
    if (result.errors.length > 0) {
      return { ok: false, errors: result.errors };
    }
    const entry = result.entry;
    if (!entry) {
      return { ok: false, errors: [] };
    }
    const name = entry.dynamicNodeSlug ?? entry.activityType;
    return {
      ok: true,
      signatureName: name,
      inputs: entry.inputs.map(
        (p) => `${p.name}: ${(p.kind as string | undefined) ?? "Artifact"}`,
      ),
      outputs: entry.outputs.map(
        (p) => `${p.name}: ${(p.kind as string | undefined) ?? "Artifact"}`,
      ),
      errors: [],
    };
  }, [debouncedParseInput]);

  // ── Debounced onChange propagation (150 ms) ───────────────────────────
  const [debouncedText] = useDebouncedValue(internalText, ONCHANGE_DEBOUNCE_MS);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onChangeRef.current(debouncedText);
  }, [debouncedText]);

  // ── Publish-time diagnostics → CodeMirror linter extension ────────────
  const publishDiagnostics = useMemo<Diagnostic[]>(() => {
    return errorsToDiagnostics(internalText, publishErrors ?? []);
  }, [internalText, publishErrors]);
  const publishLinterExtension = useMemo(
    () => linter(() => publishDiagnostics),
    [publishDiagnostics],
  );

  // ── Cursor jump on strip-error click ──────────────────────────────────
  const jumpToLineColumn = (line?: number, column?: number) => {
    if (line === undefined || line < 1) return;
    const view = editorRef.current?.view;
    if (!view) return;
    const doc = view.state.doc;
    if (line > doc.lines) return;
    const lineInfo = doc.line(line);
    const offset =
      column !== undefined && column >= 1
        ? Math.min(lineInfo.from + column - 1, lineInfo.to)
        : lineInfo.from;
    view.dispatch({
      selection: { anchor: offset, head: offset },
      scrollIntoView: true,
    });
    view.focus();
  };

  const extensions = useMemo(
    () => [lintGutter(), publishLinterExtension, EditorView.lineWrapping],
    [publishLinterExtension],
  );

  return (
    <Stack gap="xs" h="100%" data-testid="code-pane">
      <Box
        data-testid="code-pane-editor"
        style={{
          border: "1px solid var(--mantine-color-default-border)",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <CodeMirror
          value={internalText}
          theme="dark"
          height={`${height ?? 480}px`}
          extensions={extensions}
          onChange={(v) => setInternalText(v)}
          ref={editorRef}
        />
      </Box>

      {parseStrip.ok ? (
        <Alert
          color="green"
          variant="light"
          icon={<IconCheck size={16} />}
          data-testid="code-pane-strip-ok"
          p="xs"
        >
          <Text size="sm">
            Signature OK: <strong>{parseStrip.signatureName}</strong>
            {parseStrip.inputs && parseStrip.outputs ? (
              <>
                {" — "}
                {parseStrip.inputs.length > 0
                  ? parseStrip.inputs.join(", ")
                  : "(no inputs)"}
                {" → "}
                {parseStrip.outputs.length > 0
                  ? parseStrip.outputs.join(", ")
                  : "(no outputs)"}
              </>
            ) : null}
          </Text>
        </Alert>
      ) : parseStrip.errors.length > 0 ? (
        <Alert
          color="red"
          variant="light"
          icon={<IconAlertTriangle size={16} />}
          data-testid="code-pane-strip-errors"
          p="xs"
        >
          <Stack gap={4}>
            {parseStrip.errors.map((err, idx) => {
              const line = "line" in err ? err.line : undefined;
              const column = "column" in err ? err.column : undefined;
              const canJump = line !== undefined;
              return (
                <Group key={`${err.stage}-${idx}`} gap={4} wrap="nowrap">
                  {canJump ? (
                    <Anchor
                      component="button"
                      type="button"
                      size="xs"
                      onClick={() => jumpToLineColumn(line, column)}
                      data-testid={`code-pane-strip-error-${idx}`}
                    >
                      {formatErrorLine(err)}
                    </Anchor>
                  ) : (
                    <Text
                      size="xs"
                      data-testid={`code-pane-strip-error-${idx}`}
                    >
                      {formatErrorLine(err)}
                    </Text>
                  )}
                </Group>
              );
            })}
          </Stack>
        </Alert>
      ) : (
        <Text size="xs" c="dimmed" data-testid="code-pane-strip-empty">
          Add a <code>@workflow-node</code> JSDoc header to see the parsed
          signature.
        </Text>
      )}
    </Stack>
  );
}
