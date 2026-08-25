/**
 * What a kind such as `Document` actually contains (D27).
 *
 * The reviewer asked it from the custom-step editor, looking at
 * `document: Document`, and the app had no answer anywhere: the kind was a
 * bare string on a dot, a tooltip and a `<Select>` option, and nothing told
 * you its shape. This derives the answer from the live registry — never a
 * hand-written description per kind, which would drift the first time a Zod
 * schema changed.
 *
 * The honest complication, and the reason this returns a `variant` rather than
 * just a field list: **`Document` has no fields on purpose.** It is a
 * schema-free ANCESTOR — a wildcard for its family — and the shape-honest
 * subkinds (`PreparedFile`, `DocumentSegment`, …) carry the schemas instead
 * (`packages/graph-workflow/src/types/kind-schemas.ts`). Rendering "no fields"
 * for it would read as "we don't know", when the truth is "it deliberately
 * accepts anything in this family, and here are the members that ARE pinned
 * down".
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
         * Registered, but deliberately schema-free: a family wildcard.
         * `describedSubkinds` are the descendants that do have a shape.
         */
        kind: "wildcard";
        describedSubkinds: string[];
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

  return {
    ...base,
    variant: {
      kind: "wildcard",
      describedSubkinds: describedSubkindsOf(elementKind),
    },
  };
}
