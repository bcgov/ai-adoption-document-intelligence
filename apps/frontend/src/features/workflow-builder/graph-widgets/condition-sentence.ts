/**
 * A condition written out as one plain-language sentence, for the line the
 * poll and switch panels show above the condition editor ("Polling stops when
 * <this>.").
 *
 * A value from a step is named the way the step picker names it — "Poll OCR
 * Results → Poll status", with " · field" for a field drilled out of it. A
 * variable no step produces reads as its own name. Typed values keep their
 * JSON form, so text is quoted and numbers and booleans are bare. A value not
 * chosen yet reads as "…". Comparison words come from `operatorPhrase`, the
 * same vocabulary as the operator dropdowns.
 */

import type {
  ConditionExpression,
  GraphWorkflowConfig,
  ValueRef,
} from "../../../types/workflow";
import { resolveCtxKeyToProducer } from "./condition-producer-binding";
import { operatorPhrase } from "./operator-labels";

const NOT_CHOSEN = "…";

/**
 * Write `expression` out as a sentence. `currentNodeId` is the step whose
 * condition this is; it decides which producer a shared variable resolves to,
 * as it does in the step picker.
 */
export function describeCondition(
  expression: ConditionExpression,
  config: GraphWorkflowConfig,
  currentNodeId?: string,
): string {
  const value = (v: ValueRef) => describeValue(v, config, currentNodeId);
  switch (expression.operator) {
    case "and":
    case "or": {
      const joiner = expression.operator === "and" ? " and " : " or ";
      return expression.operands
        .map((operand) => {
          const inner = describeCondition(operand, config, currentNodeId);
          return operand.operator === "and" || operand.operator === "or"
            ? `(${inner})`
            : inner;
        })
        .join(joiner);
    }
    case "not":
      return `not (${describeCondition(expression.operand, config, currentNodeId)})`;
    case "is-null":
    case "is-not-null":
      return `${value(expression.value)} ${operatorPhrase(expression.operator)}`;
    case "in":
    case "not-in":
      return `${value(expression.value)} ${operatorPhrase(expression.operator)} ${value(expression.list)}`;
    default:
      return `${value(expression.left)} ${operatorPhrase(expression.operator)} ${value(expression.right)}`;
  }
}

/**
 * One side of a condition. Typed or from a step is decided the way the
 * editor's `getValueRefMode` decides it: a value with a literal is typed,
 * anything else is a reference.
 */
function describeValue(
  value: ValueRef,
  config: GraphWorkflowConfig,
  currentNodeId: string | undefined,
): string {
  if ("literal" in value && value.literal !== undefined) {
    return JSON.stringify(value.literal);
  }
  const ref = "ref" in value && value.ref !== undefined ? value.ref : "";
  if (ref === "") return NOT_CHOSEN;
  const producer = resolveCtxKeyToProducer(config, ref, currentNodeId);
  if (producer) {
    const field =
      producer.fieldPath !== undefined ? ` · ${producer.fieldPath}` : "";
    return `${producer.nodeLabel} → ${producer.portLabel}${field}`;
  }
  return ref.startsWith("ctx.") ? ref.slice(4) : ref;
}
