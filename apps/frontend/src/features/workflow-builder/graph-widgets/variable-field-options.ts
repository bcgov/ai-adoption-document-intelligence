/**
 * Prefix-driven field drill-down for the variable pickers
 * (KIND_FIELD_SCHEMAS_DESIGN.md §4–§5).
 *
 * Pure — no React. Given the grouped base options `buildVariableOptions`
 * already produces, appends `key.field` rows for keys whose resolved kind
 * carries a field schema. Generation is PREFIX-DRIVEN, never pre-expanded:
 * the empty input shows base keys + ONE level of fields; deeper levels are
 * emitted only once the typed input establishes a drillable prefix. That
 * bounds the flat Autocomplete list and doubles as the cycle guard — depth
 * only grows on deliberate author action (plus a hard MAX_DRILL_DEPTH cap).
 *
 * ctx keys may themselves contain dots (`__auto.<node>.<port>`), so path
 * splitting matches the LONGEST known base key at a dot boundary rather than
 * cutting at the first dot. A leading `ctx.` (seed/legacy ref style) is
 * stripped before matching.
 */
import {
  type FieldDescriptor,
  type KindRef,
  resolveKindFields,
} from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { resolveProducerKindFor } from "./resolve-producer-kind";

export interface VariablePathInfo {
  type: FieldDescriptor["type"] | undefined;
  kind: KindRef | undefined;
  required: boolean | undefined;
}

export interface ExpandedVariableOptions {
  groups: { group: string; items: string[] }[];
  /** Caption metadata per option value (base keys and field rows). */
  meta: Map<string, VariablePathInfo>;
}

const MAX_DRILL_DEPTH = 8;

/**
 * Split a typed path into (known base key, remaining field segments).
 * Longest known base wins; matches only whole keys or a `.` boundary.
 * Returns null when no known key is a prefix of the path.
 */
export function splitKnownBase(
  input: string,
  knownKeys: readonly string[],
): { base: string; rest: string[] } | null {
  const path = input.startsWith("ctx.") ? input.slice(4) : input;
  let best: string | null = null;
  for (const key of knownKeys) {
    if (path === key || path.startsWith(`${key}.`)) {
      if (best === null || key.length > best.length) best = key;
    }
  }
  if (best === null) return null;
  const restStr = path.slice(best.length);
  const rest = restStr === "" ? [] : restStr.slice(1).split(".");
  return { base: best, rest };
}

/**
 * The field list reachable at `base` + `segments`: resolve the base key's
 * kind, then walk each segment through its field's `kind`. Any miss (no
 * kind, unknown field, scalar field) returns [] — drilling stops.
 */
function fieldsAtPath(
  config: GraphWorkflowConfig,
  base: string,
  segments: readonly string[],
): FieldDescriptor[] {
  const baseKind = resolveProducerKindFor(base, config);
  if (baseKind === undefined) return [];
  let fields = resolveKindFields(baseKind);
  for (const segment of segments) {
    const field = fields.find((f) => f.name === segment);
    if (field?.kind === undefined) return [];
    fields = resolveKindFields(field.kind);
  }
  return fields;
}

function pathInfoOf(field: FieldDescriptor): VariablePathInfo {
  return { type: field.type, kind: field.kind, required: field.required };
}

/**
 * Expand grouped base options with field rows. `inputValue` is the picker's
 * current text; when it establishes a drillable prefix deeper than one
 * level, that deeper level is appended too.
 */
export function expandVariableOptions(
  groups: { group: string; items: string[] }[],
  config: GraphWorkflowConfig,
  inputValue: string,
): ExpandedVariableOptions {
  const knownKeys = groups.flatMap((g) => g.items);
  const meta = new Map<string, VariablePathInfo>();
  const emitted = new Set<string>();

  // Deeper-level rows requested by the current input (if any). Computed
  // once; attached after the base key they extend.
  const deep = new Map<string, string[]>(); // base key → deeper option values
  const split = splitKnownBase(inputValue, knownKeys);
  if (split !== null && split.rest.length > 0) {
    // Treat a trailing "." as "list this level"; otherwise the last segment
    // is a partial field name being typed and the level above it is listed.
    const endsWithDot = inputValue.endsWith(".");
    const drillPath = endsWithDot
      ? split.rest.filter((s) => s !== "")
      : split.rest.slice(0, -1);
    if (drillPath.length >= 1 && drillPath.length < MAX_DRILL_DEPTH) {
      const fields = fieldsAtPath(config, split.base, drillPath);
      if (fields.length > 0) {
        const prefix = `${split.base}.${drillPath.join(".")}`;
        deep.set(
          split.base,
          fields.map((f) => {
            const value = `${prefix}.${f.name}`;
            meta.set(value, pathInfoOf(f));
            return value;
          }),
        );
      }
    }
  }

  const outGroups = groups.map((g) => {
    const items: string[] = [];
    for (const key of g.items) {
      if (emitted.has(key)) continue;
      emitted.add(key);
      items.push(key);
      const baseKind = resolveProducerKindFor(key, config);
      meta.set(key, {
        type: config.ctx?.[key]?.type,
        kind: baseKind,
        required: undefined,
      });
      if (baseKind !== undefined) {
        for (const field of resolveKindFields(baseKind)) {
          const value = `${key}.${field.name}`;
          if (emitted.has(value)) continue;
          emitted.add(value);
          meta.set(value, pathInfoOf(field));
          items.push(value);
        }
      }
      const deeper = deep.get(key);
      if (deeper !== undefined) {
        for (const value of deeper) {
          if (emitted.has(value)) continue;
          emitted.add(value);
          items.push(value);
        }
      }
    }
    return { group: g.group, items };
  });

  return { groups: outGroups, meta };
}

/**
 * The kind of the VALUE a (possibly drilled) path yields — the base
 * producer kind for a bare key, the leaf field's kind for a drilled path,
 * undefined when the leaf is scalar/unknown. Used for typed-I/O
 * compatibility sorting of drilled options.
 */
export function resolveValuePathKind(
  input: string,
  config: GraphWorkflowConfig,
  knownKeys: readonly string[],
): KindRef | undefined {
  const split = splitKnownBase(input, knownKeys);
  if (split === null) return resolveProducerKindFor(input, config);
  if (split.rest.length === 0) {
    return resolveProducerKindFor(split.base, config);
  }
  const parentFields = fieldsAtPath(
    config,
    split.base,
    split.rest.slice(0, -1),
  );
  const leaf = parentFields.find(
    (f) => f.name === split.rest[split.rest.length - 1],
  );
  return leaf?.kind;
}
