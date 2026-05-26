/**
 * `CodePane` — Monaco TS editor + live signature-parse status strip
 * (Phase 6 US-177 / REQUIREMENTS L38-L40).
 *
 * The editor mounts Monaco in `language: "typescript"` + dark theme. Monaco's
 * built-in TypeScript checker is disabled — publish-time `deno check` (US-164)
 * is the source of truth for type errors. The editor surface is purely a text
 * editor with line numbers + diagnostic markers; the parsed-signature and
 * publish-time-error views are layered on top.
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
 *    surfaces as a Monaco diagnostic marker (red squiggle + tooltip).
 *    The strip below renders the same list.
 *
 * Live parse + publish errors render *both* in the strip + the editor
 * gutter; the strip is the explicit list (clickable + sortable), the
 * gutter is the inline anchor.
 */

import {
  type ParseError,
  parseDynamicNodeSignature,
} from "@ai-di/graph-workflow";
import { Alert, Anchor, Box, Group, Stack, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import type { editor } from "monaco-editor";
import { useEffect, useMemo, useRef, useState } from "react";
import { DYNAMIC_NODE_BOILERPLATE } from "./boilerplate";

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
/**
 * Owner string Monaco associates with our publish-time markers. Used as the
 * second argument to `monaco.editor.setModelMarkers` so we can clear them
 * surgically without touching diagnostics owned by other extensions.
 */
const PUBLISH_MARKER_OWNER = "dynamic-node-publish";

interface ParseStripState {
  ok: boolean;
  signatureName?: string;
  inputs?: string[];
  outputs?: string[];
  errors: ParseError[];
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

/**
 * Map a `ParseError` to a Monaco `IMarkerData` describing the squiggle
 * range. Errors without a line number are dropped — markers need an anchor.
 */
function errorsToMarkers(
  monaco: Monaco,
  model: editor.ITextModel,
  errors: ParseError[],
): editor.IMarkerData[] {
  const out: editor.IMarkerData[] = [];
  for (const err of errors) {
    const line = "line" in err ? err.line : undefined;
    if (line === undefined || line < 1 || line > model.getLineCount()) continue;
    const column = "column" in err ? err.column : undefined;
    const lineMaxColumn = model.getLineMaxColumn(line);
    const startColumn =
      column !== undefined && column >= 1 ? Math.min(column, lineMaxColumn) : 1;
    out.push({
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: line,
      startColumn,
      endLineNumber: line,
      endColumn: lineMaxColumn,
      message: err.message,
      source: err.stage,
    });
  }
  return out;
}

export function CodePane({
  script,
  onChange,
  publishErrors,
  height,
}: CodePaneProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

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

  // ── Publish-time markers → Monaco's setModelMarkers ───────────────────
  useEffect(() => {
    const monaco = monacoRef.current;
    const ed = editorRef.current;
    if (!monaco || !ed) return;
    const model = ed.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      PUBLISH_MARKER_OWNER,
      errorsToMarkers(monaco, model, publishErrors ?? []),
    );
  }, [publishErrors]);

  // ── Cursor jump on strip-error click ──────────────────────────────────
  const jumpToLineColumn = (line?: number, column?: number) => {
    if (line === undefined || line < 1) return;
    const ed = editorRef.current;
    if (!ed) return;
    const model = ed.getModel();
    if (!model) return;
    const safeLine = Math.min(line, model.getLineCount());
    const safeColumn =
      column !== undefined && column >= 1
        ? Math.min(column, model.getLineMaxColumn(safeLine))
        : 1;
    ed.revealPositionInCenter({ lineNumber: safeLine, column: safeColumn });
    ed.setPosition({ lineNumber: safeLine, column: safeColumn });
    ed.focus();
  };

  const handleMount: OnMount = (mountedEditor, mountedMonaco) => {
    editorRef.current = mountedEditor;
    monacoRef.current = mountedMonaco;
    // Disable Monaco's built-in TS checker — publish-time `deno check`
    // is the source of truth (per US-177 technical notes). Monaco's
    // type-system has different libs/strictness than Deno's, so leaving
    // it on would surface squiggles that don't match what publish flags.
    mountedMonaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(
      {
        noSemanticValidation: true,
        noSyntaxValidation: true,
        noSuggestionDiagnostics: true,
      },
    );
    // Apply any pending publish-error markers on first mount.
    const model = mountedEditor.getModel();
    if (model) {
      mountedMonaco.editor.setModelMarkers(
        model,
        PUBLISH_MARKER_OWNER,
        errorsToMarkers(mountedMonaco, model, publishErrors ?? []),
      );
    }
  };

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
        <Editor
          value={internalText}
          language="typescript"
          theme="vs-dark"
          height={`${height ?? 480}px`}
          onMount={handleMount}
          onChange={(v) => setInternalText(v ?? "")}
          options={{
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            fontSize: 13,
          }}
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
