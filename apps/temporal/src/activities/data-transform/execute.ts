import { ApplicationFailure } from "@temporalio/activity";
import { BindingResolutionError, resolveBindings } from "./binding-resolver";
import { renderCsv } from "./csv-renderer";
import type { InputFormat } from "./input-parser";
import { parseInput } from "./input-parser";
import { renderJson } from "./json-renderer";
import { injectXmlEnvelope } from "./xml-envelope-injector";
import { renderXml } from "./xml-renderer";

/**
 * Input parameters for the executeTransformNode activity.
 *
 * `rawInputContext` is a map of port name → raw value (string or already-
 * parsed JS value) sourced from the workflow context via the node's `inputs`
 * port bindings.  String values will be parsed according to `inputFormat`
 * before binding resolution; non-string values (already-parsed objects) are
 * used directly as the binding target for that port name.
 */
export interface ExecuteTransformNodeParams {
  /** The format of string values in `rawInputContext`. */
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
  /**
   * Map of port name → raw value from the workflow context.
   * String values are parsed according to `inputFormat`.
   */
  rawInputContext: Record<string, unknown>;
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
  const {
    inputFormat,
    outputFormat,
    fieldMapping,
    xmlEnvelope,
    rawInputContext,
  } = params;

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
      const innerXml = renderXml(resolvedMapping);
      output = injectXmlEnvelope(innerXml, xmlEnvelope);
      break;
    }
    case "csv":
      output = renderCsv(resolvedMapping);
      break;
  }

  return { output };
}
