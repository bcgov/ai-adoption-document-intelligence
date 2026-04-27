import { ApplicationFailure } from "@temporalio/activity";
import { parse as parseCsv } from "csv/sync";
import { XMLValidator } from "fast-xml-parser";
import { BindingResolutionError, resolveBindings } from "./binding-resolver";
import { renderCsv } from "./csv-renderer";
import type { InputFormat } from "./input-parser";
import { parseInput } from "./input-parser";
import { renderJson } from "./json-renderer";
import { injectXmlEnvelope } from "./xml-envelope-injector";
import { renderXml } from "./xml-renderer";

/**
 * Known parameter keys that are not port bindings.
 * All other keys in the params object are treated as port-binding inputs
 * and will be added to the binding context.
 */
const KNOWN_PARAM_KEYS = new Set([
  "inputFormat",
  "outputFormat",
  "fieldMapping",
  "xmlEnvelope",
  "requestId",
]);

/**
 * Input parameters for the executeTransformNode activity.
 *
 * When called through the graph activity node handler, `inputFormat`,
 * `outputFormat`, `fieldMapping`, and `xmlEnvelope` come from the node's
 * `parameters` field. Any additional keys (port names from the node's
 * `inputs` bindings) are treated as the binding context and will be parsed
 * according to `inputFormat` if they are strings.
 */
export interface ExecuteTransformNodeParams {
  /** The format of port-binding input values. */
  inputFormat: InputFormat;
  /** The format to render the resolved mapping into. */
  outputFormat: "json" | "xml" | "csv";
  /**
   * JSON-serialised field mapping object whose values may contain
   * `{{portName.field.path}}` binding expressions.
   */
  fieldMapping: string;
  /** Optional XML envelope template (XML output only). */
  xmlEnvelope?: string;
  /** Optional request correlation ID (injected by the workflow runner). */
  requestId?: string;
  /** Port-binding inputs from the workflow context (any additional keys). */
  [key: string]: unknown;
}

/**
 * Result returned by the executeTransformNode activity.
 */
export interface ExecuteTransformNodeResult {
  /** The rendered output string in the configured output format. */
  output: string;
}

/**
 * Activity: Execute the data-transform node pipeline.
 *
 * Performs the full transformation pipeline:
 *  1. Parse string values in `rawInputContext` using `inputFormat`.
 *  2. Resolve `{{...}}` binding expressions in `fieldMapping`.
 *  3. Render the resolved mapping to `outputFormat`.
 *
 * Throws a non-retryable `ApplicationFailure` with type
 * `TRANSFORM_BINDING_ERROR` when a binding expression cannot be resolved,
 * halting the Temporal workflow at this node.
 *
 * @param params - Activity input parameters.
 * @returns The rendered output string.
 */
export async function executeTransformNode(
  params: ExecuteTransformNodeParams,
): Promise<ExecuteTransformNodeResult> {
  const { inputFormat, outputFormat, fieldMapping, xmlEnvelope } = params;

  // Build the binding context from port-binding keys (all non-standard params).
  // String values are parsed according to inputFormat; non-string values are
  // used as-is (already-parsed upstream activity outputs).
  const rawInputContext: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!KNOWN_PARAM_KEYS.has(key)) {
      rawInputContext[key] = value;
    }
  }

  // Step 1: Build the binding context.
  // String values are parsed according to inputFormat; non-string values are
  // used as-is (already-parsed upstream activity outputs).
  const bindingContext: Record<string, unknown> = {};
  for (const [portName, rawValue] of Object.entries(rawInputContext)) {
    if (typeof rawValue === "string") {
      bindingContext[portName] = parseInput(rawValue, inputFormat);
    } else {
      bindingContext[portName] = rawValue;
    }
  }

  // Step 2: Parse the fieldMapping JSON string.
  let parsedMapping: Record<string, unknown>;
  try {
    parsedMapping = JSON.parse(fieldMapping) as Record<string, unknown>;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw ApplicationFailure.create({
      type: "TRANSFORM_CONFIG_ERROR",
      message: `Failed to parse fieldMapping JSON: ${detail}`,
      nonRetryable: true,
    });
  }

  // Step 3: Resolve binding expressions against the binding context.
  // BindingResolutionError is re-thrown as a non-retryable ApplicationFailure
  // so that Temporal records the unresolved path in the activity failure event.
  let resolvedMapping: Record<string, unknown>;
  try {
    resolvedMapping = resolveBindings(parsedMapping, bindingContext);
  } catch (err) {
    if (err instanceof BindingResolutionError) {
      throw ApplicationFailure.create({
        type: "TRANSFORM_BINDING_ERROR",
        message: `Unresolved binding: "${err.path}"`,
        nonRetryable: true,
      });
    }
    throw err;
  }

  // Step 4: Render the resolved mapping to the configured output format.
  let output: string;
  switch (outputFormat) {
    case "json":
      output = renderJson(resolvedMapping);
      break;
    case "xml": {
      const innerXml = renderXml(
        resolvedMapping,
        xmlEnvelope ? null : undefined,
      );
      output = injectXmlEnvelope(innerXml, xmlEnvelope);
      break;
    }
    case "csv":
      output = renderCsv(resolvedMapping);
      break;
  }

  // Step 5: Post-render output validation.
  // Attempt to re-parse the rendered string with a standard parser for each
  // format. This acts as a safety net for structural issues introduced by
  // envelope injection (US-007) or iteration resolution (US-008) that would
  // not have been caught during rendering.
  try {
    switch (outputFormat) {
      case "json":
        JSON.parse(output);
        break;
      case "xml": {
        const result = XMLValidator.validate(output);
        if (result !== true) {
          throw new Error(result.err.msg);
        }
        break;
      }
      case "csv":
        parseCsv(output);
        break;
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw ApplicationFailure.create({
      type: "TRANSFORM_OUTPUT_ERROR",
      message: `Rendered ${outputFormat} output failed validation: ${detail}`,
      nonRetryable: true,
    });
  }

  return { output };
}
