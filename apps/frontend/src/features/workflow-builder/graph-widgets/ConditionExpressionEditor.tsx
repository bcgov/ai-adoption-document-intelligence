/**
 * ConditionExpressionEditor — recursive form-style editor for the
 * `ConditionExpression` discriminated union from
 * `packages/graph-workflow/src/types.ts`.
 *
 * Purely presentational. Receives the current expression (or `undefined`)
 * and emits the updated expression via `onChange`. Renders any of the
 * five expression kinds with their matching body fields, and recursively
 * re-renders itself for nested operands. Switching operator-type
 * preserves what fits — e.g. swapping a comparison for NOT wraps the
 * existing comparison as the NOT's operand.
 *
 * Used by control-flow node settings forms for switch-case conditions
 * and pollUntil termination criteria.
 */

import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconChevronDown,
  IconChevronRight,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ComparisonExpression,
  ConditionExpression,
  GraphWorkflowConfig,
  ListMembershipExpression,
  LogicalExpression,
  NotExpression,
  NullCheckExpression,
  ValueRef,
} from "../../../types/workflow";
import { formatConditionExpanded } from "../canvas/edge-labels";
import { ConditionProducerPicker } from "./ConditionProducerPicker";
import {
  producerCtxKey,
  resolveCtxKeyToProducer,
} from "./condition-producer-binding";
import { VariablePicker } from "./VariablePicker";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

/**
 * Top-level operator-type selector values. Logical AND and OR are
 * surfaced as distinct top-level kinds so the user picks the operator in
 * a single click instead of two.
 */
export type OperatorKind =
  | "comparison"
  | "and"
  | "or"
  | "not"
  | "null-check"
  | "membership";

const OPERATOR_KIND_OPTIONS: { value: OperatorKind; label: string }[] = [
  { value: "comparison", label: "Comparison" },
  { value: "and", label: "Logical AND" },
  { value: "or", label: "Logical OR" },
  { value: "not", label: "NOT" },
  { value: "null-check", label: "Null check" },
  { value: "membership", label: "Membership" },
];

const COMPARISON_OPERATORS: ComparisonExpression["operator"][] = [
  "equals",
  "not-equals",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
];

const NULL_CHECK_OPERATORS: NullCheckExpression["operator"][] = [
  "is-null",
  "is-not-null",
];

const MEMBERSHIP_OPERATORS: ListMembershipExpression["operator"][] = [
  "in",
  "not-in",
];

export interface ConditionExpressionEditorProps {
  /** Current expression. `undefined` renders a fresh editor (defaults to comparison). */
  value: ConditionExpression | undefined;
  /**
   * Fires with the updated expression on every change, or `undefined`
   * when the editor is cleared.
   */
  onChange: (next: ConditionExpression | undefined) => void;
  /** Full graph config, forwarded to nested `VariablePicker` instances. */
  config: GraphWorkflowConfig;
  onCreateCtxKey?: (key: string) => void;
  /**
   * The id of the node currently being edited. Used so that the
   * `VariablePicker` excludes this node's own outputs from the
   * "Other nodes' outputs" group.
   */
  currentNodeId?: string;
  /**
   * Recursion depth — controls visual indent. Internal; callers should
   * not pass this.
   */
  depth?: number;
  /** Test-id prefix used on key inputs for stable selectors in tests. */
  "data-testid"?: string;
}

// ---------------------------------------------------------------------------
// Operator-kind helpers
// ---------------------------------------------------------------------------

function getOperatorKind(expr: ConditionExpression): OperatorKind {
  switch (expr.operator) {
    case "equals":
    case "not-equals":
    case "gt":
    case "gte":
    case "lt":
    case "lte":
    case "contains":
      return "comparison";
    case "and":
      return "and";
    case "or":
      return "or";
    case "not":
      return "not";
    case "is-null":
    case "is-not-null":
      return "null-check";
    case "in":
    case "not-in":
      return "membership";
  }
}

const EMPTY_REF: ValueRef = { ref: "" };

/**
 * Build a default `ConditionExpression` for a given operator kind. When
 * switching from another kind, the previous expression is folded into
 * the new shape where it fits:
 *  - Comparison/Null-check/Membership → wrapped inside `not` when
 *    switching to NOT.
 *  - Any expression → appended as the sole operand when switching to
 *    AND/OR (the user can add more via Add Operand).
 *  - When the previous expression has no useful seed for the new shape,
 *    we fall back to empty defaults.
 */
function makeDefaultForKind(
  kind: OperatorKind,
  previous: ConditionExpression | undefined,
): ConditionExpression {
  switch (kind) {
    case "comparison": {
      // Preserve operands of an existing comparison if we already had one.
      if (previous && getOperatorKind(previous) === "comparison") {
        return previous;
      }
      return {
        operator: "equals",
        left: { ...EMPTY_REF },
        right: { ...EMPTY_REF },
      };
    }
    case "and":
    case "or": {
      if (
        previous &&
        (previous.operator === "and" || previous.operator === "or")
      ) {
        return { operator: kind, operands: previous.operands };
      }
      if (previous) {
        return { operator: kind, operands: [previous] };
      }
      return {
        operator: kind,
        operands: [
          {
            operator: "equals",
            left: { ...EMPTY_REF },
            right: { ...EMPTY_REF },
          },
        ],
      };
    }
    case "not": {
      if (previous && previous.operator === "not") {
        return previous;
      }
      if (previous) {
        return { operator: "not", operand: previous };
      }
      return {
        operator: "not",
        operand: {
          operator: "equals",
          left: { ...EMPTY_REF },
          right: { ...EMPTY_REF },
        },
      };
    }
    case "null-check": {
      if (previous && getOperatorKind(previous) === "null-check") {
        return previous;
      }
      // Try to seed `value` from a previous comparison's left operand.
      const seedValue = pickValueRefSeed(previous);
      return {
        operator: "is-null",
        value: seedValue ?? { ...EMPTY_REF },
      };
    }
    case "membership": {
      if (previous && getOperatorKind(previous) === "membership") {
        return previous;
      }
      const seedValue = pickValueRefSeed(previous);
      return {
        operator: "in",
        value: seedValue ?? { ...EMPTY_REF },
        list: { ...EMPTY_REF },
      };
    }
  }
}

function pickValueRefSeed(
  previous: ConditionExpression | undefined,
): ValueRef | undefined {
  if (!previous) return undefined;
  if (previous.operator === "is-null" || previous.operator === "is-not-null") {
    return previous.value;
  }
  if (previous.operator === "in" || previous.operator === "not-in") {
    return previous.value;
  }
  // Comparison's left operand is a good seed.
  if (
    previous.operator === "equals" ||
    previous.operator === "not-equals" ||
    previous.operator === "gt" ||
    previous.operator === "gte" ||
    previous.operator === "lt" ||
    previous.operator === "lte" ||
    previous.operator === "contains"
  ) {
    return previous.left;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ConditionExpressionEditor({
  value,
  onChange,
  config,
  onCreateCtxKey,
  currentNodeId,
  depth = 0,
  "data-testid": testId,
}: ConditionExpressionEditorProps) {
  const current: ConditionExpression =
    value ?? makeDefaultForKind("comparison", undefined);

  const kind = getOperatorKind(current);

  const setKind = (nextKind: string) => {
    if (nextKind === kind) return;
    const next = makeDefaultForKind(nextKind as OperatorKind, current);
    onChange(next);
  };

  return (
    <Stack
      gap="xs"
      data-testid={testId ?? "condition-expression-editor"}
      data-depth={depth}
      style={
        depth > 0
          ? {
              borderLeft:
                "2px solid var(--mantine-color-default-border, #2c2e33)",
              paddingLeft: 12,
            }
          : undefined
      }
    >
      <Select
        label={depth === 0 ? "Expression type" : undefined}
        size="xs"
        value={kind}
        data={OPERATOR_KIND_OPTIONS}
        allowDeselect={false}
        data-testid={`${testId ?? "condition-expression-editor"}-kind`}
        onChange={(v) => {
          if (v) setKind(v);
        }}
      />

      <ExpressionBody
        expr={current}
        onChange={onChange}
        config={config}
        onCreateCtxKey={onCreateCtxKey}
        currentNodeId={currentNodeId}
        depth={depth}
        testId={testId ?? "condition-expression-editor"}
      />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Per-kind body
// ---------------------------------------------------------------------------

interface ExpressionBodyProps {
  expr: ConditionExpression;
  onChange: (next: ConditionExpression | undefined) => void;
  config: GraphWorkflowConfig;
  onCreateCtxKey?: (key: string) => void;
  currentNodeId?: string;
  depth: number;
  testId: string;
}

function ExpressionBody({
  expr,
  onChange,
  config,
  onCreateCtxKey,
  currentNodeId,
  depth,
  testId,
}: ExpressionBodyProps) {
  switch (expr.operator) {
    case "equals":
    case "not-equals":
    case "gt":
    case "gte":
    case "lt":
    case "lte":
    case "contains":
      return (
        <ComparisonBody
          expr={expr}
          onChange={onChange}
          config={config}
          onCreateCtxKey={onCreateCtxKey}
          currentNodeId={currentNodeId}
          testId={testId}
        />
      );
    case "and":
    case "or":
      return (
        <LogicalBody
          expr={expr}
          onChange={onChange}
          config={config}
          onCreateCtxKey={onCreateCtxKey}
          currentNodeId={currentNodeId}
          depth={depth}
          testId={testId}
        />
      );
    case "not":
      return (
        <NotBody
          expr={expr}
          onChange={onChange}
          config={config}
          onCreateCtxKey={onCreateCtxKey}
          currentNodeId={currentNodeId}
          depth={depth}
          testId={testId}
        />
      );
    case "is-null":
    case "is-not-null":
      return (
        <NullCheckBody
          expr={expr}
          onChange={onChange}
          config={config}
          onCreateCtxKey={onCreateCtxKey}
          currentNodeId={currentNodeId}
          testId={testId}
        />
      );
    case "in":
    case "not-in":
      return (
        <MembershipBody
          expr={expr}
          onChange={onChange}
          config={config}
          onCreateCtxKey={onCreateCtxKey}
          currentNodeId={currentNodeId}
          testId={testId}
        />
      );
  }
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

interface ComparisonBodyProps {
  expr: ComparisonExpression;
  onChange: (next: ConditionExpression) => void;
  config: GraphWorkflowConfig;
  onCreateCtxKey?: (key: string) => void;
  currentNodeId?: string;
  testId: string;
}

function ComparisonBody({
  expr,
  onChange,
  config,
  onCreateCtxKey,
  currentNodeId,
  testId,
}: ComparisonBodyProps) {
  return (
    <Stack gap="xs" data-testid={`${testId}-body-comparison`}>
      <Select
        label="Operator"
        size="xs"
        value={expr.operator}
        allowDeselect={false}
        data={COMPARISON_OPERATORS.map((op) => ({ value: op, label: op }))}
        data-testid={`${testId}-comparison-op`}
        onChange={(v) => {
          if (!v) return;
          onChange({
            ...expr,
            operator: v as ComparisonExpression["operator"],
          });
        }}
      />
      <ValueRefEditor
        label="Left"
        value={expr.left}
        onChange={(left) => onChange({ ...expr, left })}
        config={config}
        onCreateCtxKey={onCreateCtxKey}
        currentNodeId={currentNodeId}
        testId={`${testId}-left`}
      />
      <ValueRefEditor
        label="Right"
        value={expr.right}
        onChange={(right) => onChange({ ...expr, right })}
        config={config}
        onCreateCtxKey={onCreateCtxKey}
        currentNodeId={currentNodeId}
        testId={`${testId}-right`}
      />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Logical (and / or)
// ---------------------------------------------------------------------------

interface LogicalBodyProps {
  expr: LogicalExpression;
  onChange: (next: ConditionExpression) => void;
  config: GraphWorkflowConfig;
  onCreateCtxKey?: (key: string) => void;
  currentNodeId?: string;
  depth: number;
  testId: string;
}

function LogicalBody({
  expr,
  onChange,
  config,
  onCreateCtxKey,
  currentNodeId,
  depth,
  testId,
}: LogicalBodyProps) {
  const setOperandAt = (
    index: number,
    next: ConditionExpression | undefined,
  ) => {
    if (!next) {
      // Removing an operand via the inner editor clearing itself is the
      // same as the explicit Remove button.
      removeOperandAt(index);
      return;
    }
    const operands = expr.operands.map((op, i) => (i === index ? next : op));
    onChange({ ...expr, operands });
  };

  const addOperand = () => {
    const operands = [
      ...expr.operands,
      {
        operator: "equals",
        left: { ...EMPTY_REF },
        right: { ...EMPTY_REF },
      } satisfies ComparisonExpression,
    ];
    onChange({ ...expr, operands });
  };

  const removeOperandAt = (index: number) => {
    const operands = expr.operands.filter((_, i) => i !== index);
    onChange({ ...expr, operands });
  };

  // Groups start expanded; collapsing hides the operand form. The one-line
  // humanised summary sits under EVERY group's header at every depth — so you
  // can always read what a group represents without collapsing it, and every
  // group (top-level or nested) is displayed consistently. Collapsing just
  // hides the operand editors, leaving the summary as the group's compact form.
  const [collapsed, setCollapsed] = useState(false);
  const verb =
    expr.operator === "and"
      ? "ALL of these must be true"
      : "ANY of these can be true";
  const summary = formatConditionExpanded(expr).trim();

  return (
    <Stack
      gap="xs"
      data-testid={`${testId}-body-logical`}
      data-operator={expr.operator}
    >
      <Group gap={6} align="center" wrap="nowrap">
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand group" : "Collapse group"}
          data-testid={`${testId}-collapse-toggle`}
        >
          {collapsed ? (
            <IconChevronRight size={14} />
          ) : (
            <IconChevronDown size={14} />
          )}
        </ActionIcon>
        <Text
          size="10px"
          c="dimmed"
          fw={600}
          style={{ textTransform: "uppercase", letterSpacing: 0.4 }}
        >
          {verb}
        </Text>
      </Group>
      <Text
        size="xs"
        c="dimmed"
        data-testid={`${testId}-group-summary`}
        style={{ paddingLeft: 28, wordBreak: "break-word" }}
      >
        {summary || "empty group"}
      </Text>
      {collapsed ? null : (
        <>
          <Stack gap="xs">
            {expr.operands.map((operand, index) => (
              <Group
                key={`operand-${index}`}
                gap="xs"
                align="flex-start"
                wrap="nowrap"
                data-testid={`${testId}-operand-${index}`}
              >
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <ConditionExpressionEditor
                    value={operand}
                    onChange={(next) => setOperandAt(index, next)}
                    config={config}
                    onCreateCtxKey={onCreateCtxKey}
                    currentNodeId={currentNodeId}
                    depth={depth + 1}
                    data-testid={`${testId}-operand-${index}-editor`}
                  />
                </Box>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="red"
                  onClick={() => removeOperandAt(index)}
                  aria-label={`Remove operand ${index}`}
                  data-testid={`${testId}-operand-${index}-remove`}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
          <Group justify="flex-start">
            <Button
              size="compact-xs"
              variant="light"
              onClick={addOperand}
              data-testid={`${testId}-add-operand`}
            >
              Add operand
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// NOT
// ---------------------------------------------------------------------------

interface NotBodyProps {
  expr: NotExpression;
  onChange: (next: ConditionExpression) => void;
  config: GraphWorkflowConfig;
  onCreateCtxKey?: (key: string) => void;
  currentNodeId?: string;
  depth: number;
  testId: string;
}

function NotBody({
  expr,
  onChange,
  config,
  onCreateCtxKey,
  currentNodeId,
  depth,
  testId,
}: NotBodyProps) {
  return (
    <Box data-testid={`${testId}-body-not`}>
      <ConditionExpressionEditor
        value={expr.operand}
        onChange={(next) => {
          if (next) {
            onChange({ ...expr, operand: next });
          }
        }}
        config={config}
        onCreateCtxKey={onCreateCtxKey}
        currentNodeId={currentNodeId}
        depth={depth + 1}
        data-testid={`${testId}-not-operand-editor`}
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Null check
// ---------------------------------------------------------------------------

interface NullCheckBodyProps {
  expr: NullCheckExpression;
  onChange: (next: ConditionExpression) => void;
  config: GraphWorkflowConfig;
  onCreateCtxKey?: (key: string) => void;
  currentNodeId?: string;
  testId: string;
}

function NullCheckBody({
  expr,
  onChange,
  config,
  onCreateCtxKey,
  currentNodeId,
  testId,
}: NullCheckBodyProps) {
  return (
    <Stack gap="xs" data-testid={`${testId}-body-null-check`}>
      <Select
        label="Operator"
        size="xs"
        value={expr.operator}
        allowDeselect={false}
        data={NULL_CHECK_OPERATORS.map((op) => ({ value: op, label: op }))}
        data-testid={`${testId}-null-check-op`}
        onChange={(v) => {
          if (!v) return;
          onChange({
            ...expr,
            operator: v as NullCheckExpression["operator"],
          });
        }}
      />
      <ValueRefEditor
        label="Value"
        value={expr.value}
        onChange={(value) => onChange({ ...expr, value })}
        config={config}
        onCreateCtxKey={onCreateCtxKey}
        currentNodeId={currentNodeId}
        testId={`${testId}-value`}
      />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Membership (in / not-in)
// ---------------------------------------------------------------------------

interface MembershipBodyProps {
  expr: ListMembershipExpression;
  onChange: (next: ConditionExpression) => void;
  config: GraphWorkflowConfig;
  onCreateCtxKey?: (key: string) => void;
  currentNodeId?: string;
  testId: string;
}

function MembershipBody({
  expr,
  onChange,
  config,
  onCreateCtxKey,
  currentNodeId,
  testId,
}: MembershipBodyProps) {
  return (
    <Stack gap="xs" data-testid={`${testId}-body-membership`}>
      <Select
        label="Operator"
        size="xs"
        value={expr.operator}
        allowDeselect={false}
        data={MEMBERSHIP_OPERATORS.map((op) => ({ value: op, label: op }))}
        data-testid={`${testId}-membership-op`}
        onChange={(v) => {
          if (!v) return;
          onChange({
            ...expr,
            operator: v as ListMembershipExpression["operator"],
          });
        }}
      />
      <ValueRefEditor
        label="Value"
        value={expr.value}
        onChange={(value) => onChange({ ...expr, value })}
        config={config}
        onCreateCtxKey={onCreateCtxKey}
        currentNodeId={currentNodeId}
        testId={`${testId}-value`}
      />
      <ValueRefEditor
        label="List"
        value={expr.list}
        onChange={(list) => onChange({ ...expr, list })}
        config={config}
        onCreateCtxKey={onCreateCtxKey}
        currentNodeId={currentNodeId}
        testId={`${testId}-list`}
      />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// ValueRef editor (Ref / Literal toggle)
// ---------------------------------------------------------------------------

interface ValueRefEditorProps {
  label: string;
  value: ValueRef;
  onChange: (next: ValueRef) => void;
  config: GraphWorkflowConfig;
  onCreateCtxKey?: (key: string) => void;
  currentNodeId?: string;
  testId: string;
}

type ValueRefMode = "ref" | "literal";

function getValueRefMode(value: ValueRef): ValueRefMode {
  if ("literal" in value && value.literal !== undefined) {
    return "literal";
  }
  if ("ref" in value && value.ref !== undefined) {
    return "ref";
  }
  return "ref";
}

function literalToString(literal: unknown): string {
  if (literal === undefined || literal === null) return "";
  if (typeof literal === "string") return literal;
  return JSON.stringify(literal);
}

/**
 * Parse a literal string. Try JSON first so the user can author numbers,
 * booleans, arrays, objects, and `null`; if parsing fails fall back to a
 * raw string. Empty input is treated as an empty string literal.
 */
function parseLiteral(input: string): unknown {
  if (input === "") return "";
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

function ValueRefEditor({
  label,
  value,
  onChange,
  config,
  onCreateCtxKey,
  currentNodeId,
  testId,
}: ValueRefEditorProps) {
  const mode = getValueRefMode(value);

  const refValue = "ref" in value && value.ref !== undefined ? value.ref : "";
  const resolved = useMemo(
    () => resolveCtxKeyToProducer(config, refValue, currentNodeId),
    [config, refValue, currentNodeId],
  );
  const canUseSteps = currentNodeId !== undefined && currentNodeId !== "";
  const [manualOverride, setManualOverride] = useState(false);
  const forcedManual = refValue !== "" && resolved === null;
  const subMode: "step" | "manual" =
    !canUseSteps || manualOverride || forcedManual ? "manual" : "step";

  const pickProducer = (sel: {
    producerNodeId: string;
    producerPort: string;
  }) => {
    onChange({
      ref: producerCtxKey(config, sel.producerNodeId, sel.producerPort),
    });
  };

  // §4.13: hold the literal input as local text so typing is STABLE. The
  // input's displayed value used to be re-derived from the parsed literal on
  // every keystroke (`literalToString(parseLiteral(text))`), so the stored
  // type flipped mid-typing (string→number→bool→null) and quoted strings like
  // `"10"` were reformatted away (making `status == "10"` impossible to
  // author). Local text is the source of truth for display; we still emit the
  // parsed value on change. We re-sync from an EXTERNAL value change (mode
  // switch, loading a different condition) but ignore the echo of our own
  // edits by comparing the canonical string of what we last emitted.
  const incomingLiteral = "literal" in value ? value.literal : undefined;
  const incomingCanonical = literalToString(incomingLiteral);
  const [literalText, setLiteralText] = useState<string>(incomingCanonical);
  const lastEmittedCanonicalRef = useRef<string>(incomingCanonical);
  useEffect(() => {
    if (incomingCanonical !== lastEmittedCanonicalRef.current) {
      setLiteralText(incomingCanonical);
      lastEmittedCanonicalRef.current = incomingCanonical;
    }
  }, [incomingCanonical]);

  const handleLiteralChange = (text: string) => {
    setLiteralText(text);
    const parsed = parseLiteral(text);
    lastEmittedCanonicalRef.current = literalToString(parsed);
    onChange({ literal: parsed });
  };

  const setMode = (nextMode: string) => {
    const m = nextMode as ValueRefMode;
    if (m === mode) return;
    if (m === "ref") {
      onChange({ ref: "" });
    } else {
      onChange({ literal: "" });
    }
  };

  return (
    <Stack gap={4} data-testid={testId}>
      <Group justify="space-between" align="flex-end" wrap="nowrap">
        <Text size="xs" fw={500}>
          {label}
        </Text>
        <SegmentedControl
          size="xs"
          value={mode}
          data={[
            { value: "ref", label: "Ref" },
            { value: "literal", label: "Literal" },
          ]}
          data-testid={`${testId}-mode`}
          onChange={setMode}
        />
      </Group>
      {mode === "ref" ? (
        subMode === "step" ? (
          <Stack gap={4}>
            {resolved && (
              <Text size="10px" c="dimmed" data-testid={`${testId}-resolved`}>
                {resolved.nodeLabel} → {resolved.portLabel}
              </Text>
            )}
            <ConditionProducerPicker
              config={config}
              currentNodeId={currentNodeId ?? ""}
              value={refValue}
              onChange={pickProducer}
            />
            <Anchor
              component="button"
              type="button"
              size="xs"
              data-testid={`${testId}-manual-link`}
              onClick={() => setManualOverride(true)}
            >
              Enter a variable manually
            </Anchor>
          </Stack>
        ) : (
          <Stack gap={4}>
            <VariablePicker
              config={config}
              onCreateCtxKey={onCreateCtxKey}
              currentNodeId={currentNodeId}
              value={refValue}
              onChange={(nextRef) => onChange({ ref: nextRef })}
              placeholder="Pick a ctx variable…"
              data-testid={`${testId}-ref-input`}
            />
            {canUseSteps && !forcedManual && (
              <Anchor
                component="button"
                type="button"
                size="xs"
                data-testid={`${testId}-steps-link`}
                onClick={() => setManualOverride(false)}
              >
                Back to steps
              </Anchor>
            )}
          </Stack>
        )
      ) : (
        <TextInput
          size="xs"
          placeholder="Literal value (JSON or plain string)"
          value={literalText}
          data-testid={`${testId}-literal-input`}
          onChange={(e) => handleLiteralChange(e.currentTarget.value)}
        />
      )}
    </Stack>
  );
}
