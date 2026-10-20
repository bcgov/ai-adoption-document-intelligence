/**
 * What a kind such as `Document` actually contains, for the kind popover.
 *
 * The answer is derived from the live registry, never from a hand-written
 * description per kind, which would drift the first time a Zod schema changed.
 *
 * It is returned as a `variant` rather than just a field list because a kind
 * with no fields is one of two different things, and "no fields" alone would
 * read as "we don't know":
 *
 *   - a family wildcard, such as `Document`: a schema-free ANCESTOR that
 *     deliberately accepts anything in its family, while the shape-honest
 *     subkinds (`PreparedFile`, `DocumentSegment`, …) carry the schemas
 *     (`packages/graph-workflow/src/types/kind-schemas.ts`);
 *   - a single kind that nothing descends from and whose contents the
 *     registry does not describe, such as `DocumentId`. Calling that a family
 *     would be false, because it has no members.
 */

import {
  ARTIFACT_REGISTRY,
  type ArtifactKindMeta,
  type FieldDescriptor,
  getArtifactKindMeta,
  resolveKindFields,
} from "@ai-di/graph-workflow";

export interface KindShape {
  /** The kind as written, e.g. `"DocumentSegment[]"`. */
  ref: string;
  /** The element kind with any `[]` suffix removed. */
  elementKind: string;
  /** True when `ref` ended in `[]` — "a list of these". */
  isList: boolean;
  /** Registry display name, or the raw kind when it is not registered. */
  displayName: string;
  /**
   * The `baseKind` chain from the immediate parent outwards, e.g.
   * `["Segment", "Artifact"]`. Empty for `Artifact` and unregistered kinds.
   */
  ancestry: string[];
  variant:
    | {
        /** The kind declares (or inherits) a field schema. */
        kind: "fields";
        fields: FieldDescriptor[];
      }
    | {
        /**
         * Registered, schema-free, and the base of other kinds: a family
         * wildcard. `describedSubkinds` are the descendants that do have a
         * shape.
         */
        kind: "wildcard";
        describedSubkinds: string[];
      }
    | {
        /**
         * Registered and schema-free, and no kind descends from it: one kind
         * whose contents the registry does not describe.
         */
        kind: "leaf";
      }
    | {
        /** Not in the registry at all — a dynamic node can name one. */
        kind: "unregistered";
      };
}

function isDescendantOf(candidate: string, ancestor: string): boolean {
  let meta: ArtifactKindMeta | undefined = getArtifactKindMeta(candidate);
  // Bounded for the same reason `resolveKindFields` bounds its walk: a
  // hand-registered runtime kind could in principle name itself as its base.
  for (let hops = 0; hops < 16 && meta?.baseKind !== undefined; hops += 1) {
    if (meta.baseKind === ancestor) return true;
    meta = getArtifactKindMeta(meta.baseKind);
  }
  return false;
}

/**
 * Descendants of `kind` that carry their own field schema, nearest first by
 * registry order. Read off `ARTIFACT_REGISTRY` rather than the live map so the
 * list is the documented vocabulary and not whatever a dynamic node registered
 * this session.
 */
function describedSubkindsOf(kind: string): string[] {
  return Object.entries(ARTIFACT_REGISTRY)
    .filter(
      ([name, meta]) =>
        name !== kind &&
        (meta.fields?.length ?? 0) > 0 &&
        isDescendantOf(name, kind),
    )
    .map(([name]) => name);
}

/**
 * Whether any kind names `kind` as its base, which is what makes `kind` a
 * family. Read off `ARTIFACT_REGISTRY` for the same reason as
 * `describedSubkindsOf`.
 */
function hasSubkinds(kind: string): boolean {
  return Object.values(ARTIFACT_REGISTRY).some(
    (meta) => meta.baseKind === kind,
  );
}

/**
 * Describe a kind reference for display. Never throws: an unknown kind is a
 * legitimate state (a dynamic node's `@inputs` can name one before it is
 * registered) and gets the `unregistered` variant.
 */
export function describeKind(ref: string): KindShape {
  const isList = ref.endsWith("[]");
  const elementKind = isList ? ref.slice(0, -2) : ref;
  const meta = getArtifactKindMeta(elementKind);

  const ancestry: string[] = [];
  let cursor = meta;
  for (let hops = 0; hops < 16 && cursor?.baseKind !== undefined; hops += 1) {
    ancestry.push(cursor.baseKind);
    cursor = getArtifactKindMeta(cursor.baseKind);
  }

  const base = {
    ref,
    elementKind,
    isList,
    displayName: meta?.displayName ?? elementKind,
    ancestry,
  };

  if (meta === undefined) {
    return { ...base, variant: { kind: "unregistered" } };
  }

  const fields = resolveKindFields(elementKind);
  if (fields.length > 0) {
    return { ...base, variant: { kind: "fields", fields } };
  }

  if (!hasSubkinds(elementKind)) {
    return { ...base, variant: { kind: "leaf" } };
  }

  return {
    ...base,
    variant: {
      kind: "wildcard",
      describedSubkinds: describedSubkindsOf(elementKind),
    },
  };
}
