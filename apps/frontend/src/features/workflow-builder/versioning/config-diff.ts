/**
 * Structural diff of two workflow configs, for the compare-to-head modal.
 *
 * Two full configs side by side leave the reader to spot the difference in
 * two ~400-line JSON blocks, so the modal leads with this list of changed
 * fields instead.
 *
 * No diff library is in the frontend's dependency tree (checked
 * `apps/frontend/package.json` — no `diff`, `jsondiffpatch`,
 * `react-diff-viewer`), and adding one for this is not worth a new dependency:
 * a text diff would also be the wrong shape. Workflow configs are objects
 * whose key ORDER is not meaningful, so a line diff reports moves as
 * changes. This walks the two objects to their leaves instead and compares
 * leaf by leaf, which is what "what changed in this workflow" actually means.
 *
 * List items are matched by identity where the list has one, not by
 * position: deleting a step removes its wires from the middle of `edges`, and
 * a positional comparison would then report every later wire as changed or
 * removed although it is still there.
 */

export type ConfigDiffKind = "added" | "removed" | "changed" | "unchanged";

export interface ConfigDiffEntry {
  /**
   * Dotted path to the leaf. A list item is named by its identity when the
   * list has one (`edges[id=a-b].source`, `nodes.ocr.inputs[port=file].ctxKey`)
   * and by its position otherwise (`metadata.tags[0]`).
   */
  path: string;
  kind: ConfigDiffKind;
  /** JSON-rendered value on the older version. `undefined` when added. */
  left?: string;
  /** JSON-rendered value on head. `undefined` when removed. */
  right?: string;
}

export interface ConfigDiffSummary {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Paths whose value is COMPUTED from the rest of the config, so reporting them
 * tells the reader nothing they did not already learn from the field that
 * actually changed. `metadata.configHash` is stamped on every save by
 * `stampConfigWithPersistedHash`, so without this it changed in every diff and
 * turned "1 changed field" into "2" — one of them a 64-character hash.
 *
 * Excluded rather than de-emphasised, and named in the modal's footnote so the
 * omission is stated rather than silent.
 */
export const DERIVED_PATHS: readonly string[] = ["metadata.configHash"];

/**
 * Fields that identify an item within a list, tried in order: a wire by its
 * `id`, a step's input or output binding by its `port`. A list is matched on
 * the first field that every item on both sides holds as a string, with no
 * two items on one side sharing a value. Any other list is matched by
 * position.
 */
const IDENTITY_FIELDS: readonly string[] = ["id", "port"];

/** Objects and arrays — the things the walk can descend into. */
function isContainer(value: JsonValue): boolean {
  return value !== null && typeof value === "object";
}

/**
 * A leaf is anything with no leaves under it: scalars, and also empty
 * objects/arrays (which have no children and would otherwise vanish from the
 * diff entirely).
 */
function isLeaf(value: JsonValue): boolean {
  if (value === null || typeof value !== "object") return true;
  return Object.keys(value).length === 0;
}

function formatValue(value: JsonValue): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? "undefined";
}

function childPath(base: string, key: string, isIndex: boolean): string {
  if (isIndex) return `${base}[${key}]`;
  return base.length === 0 ? key : `${base}.${key}`;
}

function keysOf(value: JsonValue): { keys: string[]; isArray: boolean } {
  if (Array.isArray(value)) {
    return { keys: value.map((_, i) => String(i)), isArray: true };
  }
  if (value !== null && typeof value === "object") {
    return { keys: Object.keys(value), isArray: false };
  }
  return { keys: [], isArray: false };
}

function childAt(value: JsonValue, key: string): JsonValue | undefined {
  if (Array.isArray(value)) return value[Number(key)];
  if (value !== null && typeof value === "object") {
    return (value as { [k: string]: JsonValue })[key];
  }
  return undefined;
}

/** The value of `field` on a list item, when the item is an object holding it as a string. */
function identityOf(item: JsonValue, field: string): string | undefined {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    return undefined;
  }
  const value = item[field];
  return typeof value === "string" ? value : undefined;
}

function identifiesEveryItem(items: JsonValue[], field: string): boolean {
  const seen = new Set<string>();
  for (const item of items) {
    const identity = identityOf(item, field);
    if (identity === undefined || seen.has(identity)) return false;
    seen.add(identity);
  }
  return true;
}

/** The identity field shared by every item of every given list, if any. */
function identityFieldFor(...lists: JsonValue[][]): string | null {
  for (const field of IDENTITY_FIELDS) {
    if (lists.every((items) => identifiesEveryItem(items, field))) {
      return field;
    }
  }
  return null;
}

/**
 * Pairs list items that share an identity and diffs each pair. Items present
 * on one side only are reported whole, as added or removed. Order is the
 * older version's items first, then the ones only head has.
 */
function walkByIdentity(
  left: JsonValue[],
  right: JsonValue[],
  field: string,
  path: string,
  out: ConfigDiffEntry[],
): void {
  const rightById = new Map<string, JsonValue>();
  for (const item of right) {
    const identity = identityOf(item, field);
    if (identity !== undefined) rightById.set(identity, item);
  }
  const leftIds = new Set<string>();
  for (const item of left) {
    const identity = identityOf(item, field);
    if (identity === undefined) continue;
    leftIds.add(identity);
    walk(item, rightById.get(identity), `${path}[${field}=${identity}]`, out);
  }
  for (const item of right) {
    const identity = identityOf(item, field);
    if (identity === undefined || leftIds.has(identity)) continue;
    walk(undefined, item, `${path}[${field}=${identity}]`, out);
  }
}

/**
 * Collects every leaf under `value` as an entry of the given one-sided kind —
 * used when a whole subtree exists on only one side.
 */
function collectSide(
  value: JsonValue,
  path: string,
  kind: "added" | "removed",
  out: ConfigDiffEntry[],
): void {
  if (isLeaf(value)) {
    out.push(
      kind === "added"
        ? { path, kind, right: formatValue(value) }
        : { path, kind, left: formatValue(value) },
    );
    return;
  }
  // Named the same way as a list present on both sides, so a deleted step's
  // bindings read `inputs[port=…]` like everyone else's.
  if (Array.isArray(value)) {
    const identityField = identityFieldFor(value);
    if (identityField !== null) {
      for (const item of value) {
        const identity = identityOf(item, identityField);
        if (identity === undefined) continue;
        collectSide(item, `${path}[${identityField}=${identity}]`, kind, out);
      }
      return;
    }
  }
  const { keys, isArray } = keysOf(value);
  for (const key of keys) {
    const child = childAt(value, key);
    if (child === undefined) continue;
    collectSide(child, childPath(path, key, isArray), kind, out);
  }
}

function walk(
  left: JsonValue | undefined,
  right: JsonValue | undefined,
  path: string,
  out: ConfigDiffEntry[],
): void {
  if (DERIVED_PATHS.includes(path)) return;
  if (left === undefined && right === undefined) return;
  if (left === undefined) {
    collectSide(right as JsonValue, path, "added", out);
    return;
  }
  if (right === undefined) {
    collectSide(left, path, "removed", out);
    return;
  }

  const bothContainers = isContainer(left) && isContainer(right);
  const bothEmpty =
    bothContainers &&
    isLeaf(left) &&
    isLeaf(right) &&
    formatValue(left) === formatValue(right);

  // A container against a SCALAR is a shape change, and only honest to report
  // as one changed value rather than a pile of adds and removes. Two
  // containers always recurse — including when one of them is empty, so that
  // "this node exists only in head" expands into the fields it actually adds.
  // Two identical empty containers have no leaves at all, so they are emitted
  // here or they vanish from the diff.
  if (bothEmpty) {
    const value = formatValue(left);
    out.push({ path, kind: "unchanged", left: value, right: value });
    return;
  }
  if (!bothContainers) {
    const l = formatValue(left);
    const r = formatValue(right);
    out.push(
      l === r
        ? { path, kind: "unchanged", left: l, right: r }
        : { path, kind: "changed", left: l, right: r },
    );
    return;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    const identityField = identityFieldFor(left, right);
    if (identityField !== null) {
      walkByIdentity(left, right, identityField, path, out);
      return;
    }
  }

  const leftKeys = keysOf(left);
  const rightKeys = keysOf(right);
  const seen = new Set<string>();
  for (const key of [...leftKeys.keys, ...rightKeys.keys]) {
    if (seen.has(key)) continue;
    seen.add(key);
    const isIndex = leftKeys.isArray || rightKeys.isArray;
    walk(
      childAt(left, key),
      childAt(right, key),
      childPath(path, key, isIndex),
      out,
    );
  }
}

/**
 * Diffs two configs leaf by leaf. Entries come back in walk order (left's
 * keys and list items first, then those only present on the right), which
 * keeps related fields — a node and its parameters — next to each other.
 */
export function diffConfigs(left: unknown, right: unknown): ConfigDiffEntry[] {
  const out: ConfigDiffEntry[] = [];
  walk(left as JsonValue, right as JsonValue, "", out);
  return out;
}

export function summariseDiff(entries: ConfigDiffEntry[]): ConfigDiffSummary {
  const summary: ConfigDiffSummary = {
    added: 0,
    removed: 0,
    changed: 0,
    unchanged: 0,
  };
  for (const entry of entries) summary[entry.kind] += 1;
  return summary;
}

/**
 * One-line headline for the modal: what a reader needs before deciding
 * whether to open anything. Counts fields, not lines, because a field is the
 * unit the editor edits.
 */
export function describeDiff(summary: ConfigDiffSummary): string {
  const parts: string[] = [];
  if (summary.changed > 0) parts.push(`${summary.changed} changed`);
  if (summary.added > 0) parts.push(`${summary.added} added`);
  if (summary.removed > 0) parts.push(`${summary.removed} removed`);
  if (parts.length === 0)
    return "No differences — the two configs are identical.";
  const fieldWord =
    summary.changed + summary.added + summary.removed === 1
      ? "field"
      : "fields";
  return `${parts.join(", ")} ${fieldWord} of ${
    summary.changed + summary.added + summary.removed + summary.unchanged
  }.`;
}
