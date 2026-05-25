import {
  ACTIVITY_CATALOG,
  type ActivityCatalogEntry,
  type DynamicNodePort,
  type DynamicNodeSignature,
  type KindRef,
  type ParseError,
  parseDynamicNodeSignature,
  type TsCheckError,
} from "@ai-di/graph-workflow";
import { Injectable } from "@nestjs/common";
import {
  CATALOG_CACHE_MAX_ENTRIES,
  CATALOG_CACHE_TTL_MS,
  CatalogCache,
} from "./catalog-cache";
import { DenoRunnerClient } from "./deno-runner.client";
import { DynamicNodeRepository } from "./dynamic-node.repository";

/**
 * Service input for `publish` — covers both create-mode (`POST`) and
 * update-mode (`PUT`). The controller passes the path slug for update-mode
 * so the service can detect `@name` mismatches at the semantics layer.
 */
export interface PublishInput {
  groupId: string;
  /** Pre-existing slug from `PUT /:slug`. Undefined for `POST`. */
  pathSlug?: string;
  script: string;
  mode: "create" | "update";
  actorUserId?: string;
}

/**
 * Service output for `publish` on the happy path. On failure, the service
 * throws either `PublishValidationError` (carries the structured `ParseError[]`),
 * `NameMismatchError`, or one of the repo's typed errors propagated upward.
 */
export interface PublishResult {
  slug: string;
  version: number;
  signature: DynamicNodeSignature;
}

/**
 * Thrown when one of the publish-time validation stages produces structured
 * errors. The controller maps this to HTTP 400 with `{ errors }` body.
 */
export class PublishValidationError extends Error {
  readonly errors: ParseError[];
  constructor(errors: ParseError[]) {
    super(`Publish validation failed with ${errors.length} error(s)`);
    this.name = "PublishValidationError";
    this.errors = errors;
  }
}

/**
 * Thrown when a `PUT /:slug` carries a script whose `@name` differs from
 * the path slug. The controller maps this to HTTP 409 with the structured
 * `{ code: "NAME_MISMATCH", pathSlug, scriptName }` body per US-166.
 */
export class NameMismatchError extends Error {
  readonly pathSlug: string;
  readonly scriptName: string;
  constructor(pathSlug: string, scriptName: string) {
    super(
      `Path slug '${pathSlug}' does not match script @name '${scriptName}'`,
    );
    this.name = "NameMismatchError";
    this.pathSlug = pathSlug;
    this.scriptName = scriptName;
  }
}

/**
 * `DynamicNodesService` — orchestrates the four-stage publish-time
 * validation pipeline (REQUIREMENTS.md §3.3 L28):
 *
 *   1. `jsdoc-parse` — shared `parseDynamicNodeSignature` runs the JSDoc
 *      parse stage.
 *   2. `signature-semantics` — same parser also handles kind/registry +
 *      slug regex + `@parameters` schema coercion (US-159).
 *   3. `ts-check` — POST to `${DENO_RUNNER_URL}/check` on the sidecar.
 *   4. `allowlist` — intersect script's `@allowNet` against the global
 *      `DYNAMIC_NODE_ALLOW_NET` env var (comma-separated host patterns).
 *
 * On all-stages-pass, the parsed signature + allowlist-intersected hosts
 * are persisted via the repository (create-mode or update-mode).
 *
 * Failure semantics:
 *  - Any stage producing errors short-circuits — subsequent stages do NOT
 *    run.
 *  - Runner unreachable surfaces as `DenoRunnerUnavailableError` from the
 *    client; the controller maps it to HTTP 503.
 *  - `PUT` with `@name != pathSlug` throws `NameMismatchError` before
 *    even hitting `deno check` (semantics layer).
 *  - Repo-level errors (`DuplicateSlugError`, `DynamicNodeNotFoundError`,
 *    `DynamicNodeDeletedError`) propagate; the controller maps them to
 *    the appropriate HTTP exception.
 */
@Injectable()
export class DynamicNodesService {
  /**
   * Read-once snapshot of the global allowlist. Empty by default — every
   * host in `@allowNet` must appear here to pass validation (note: the
   * worker per L32 auto-grants the API_BASE_URL host at execute time;
   * the publish-time allowlist is what governs script-author-declared
   * hosts).
   */
  private readonly globalAllowlist: ReadonlySet<string>;

  /**
   * Per-group server-side cache of the merged activity catalog
   * (US-173 Scenario 4). Keyed by `groupId`, TTL = 30 s, LRU-bounded.
   * Read by `getMergedCatalogForGroup`; cleared by
   * `invalidateGroupCatalogCache` (called from the controller's
   * POST/PUT/DELETE handlers after the DB write commits).
   */
  private readonly catalogCache: CatalogCache;

  constructor(
    private readonly repository: DynamicNodeRepository,
    private readonly denoRunnerClient: DenoRunnerClient,
  ) {
    this.globalAllowlist = parseGlobalAllowlist(
      process.env.DYNAMIC_NODE_ALLOW_NET,
    );
    this.catalogCache = new CatalogCache(
      CATALOG_CACHE_TTL_MS,
      CATALOG_CACHE_MAX_ENTRIES,
    );
  }

  /**
   * Build the merged activity catalog for the calling group:
   *  - All static catalog entries from `ACTIVITY_CATALOG`, in their
   *    registered order.
   *  - Followed by the group's non-deleted dynamic-node head versions,
   *    sorted by `signature.name` ascending. Each dynamic entry carries
   *    `activityType: "dyn.<slug>"`, `dynamicNodeSlug`,
   *    `dynamicNodeVersion`, and `colorHint: "dyn"`.
   *
   * Caches the dynamic-entry list per group for 30 s (US-173 Scenario 4).
   * The static-entry list is composed in every call — it's an
   * in-memory `Record` lookup, so the marginal cost is negligible.
   */
  async getMergedCatalogForGroup(
    groupId: string,
  ): Promise<ActivityCatalogEntry[]> {
    const staticEntries = Object.values(ACTIVITY_CATALOG);

    const cached = this.catalogCache.get(groupId);
    if (cached !== undefined) {
      return [...staticEntries, ...cached];
    }

    const lineages = await this.repository.listForGroup(groupId);
    const dynamicEntries: ActivityCatalogEntry[] = [];
    for (const lineage of lineages) {
      if (lineage.headVersion === null) {
        // A non-deleted lineage with no head version shouldn't happen
        // (the `createWithFirstVersion` transaction guarantees a head).
        // Skip silently here — the lineage list endpoint already
        // surfaces these as 500s in the management page.
        continue;
      }
      const signature = lineage.headVersion
        .signature as unknown as DynamicNodeSignature;
      dynamicEntries.push(
        signatureToCatalogEntry(signature, lineage.headVersion.versionNumber),
      );
    }
    dynamicEntries.sort((a, b) => {
      const aName = a.dynamicNodeSlug ?? "";
      const bName = b.dynamicNodeSlug ?? "";
      return aName.localeCompare(bName);
    });

    this.catalogCache.set(groupId, dynamicEntries);
    return [...staticEntries, ...dynamicEntries];
  }

  /**
   * Drop the catalog cache entry for the group. Called by the
   * dynamic-nodes controller after every successful POST/PUT/DELETE so
   * the next `getMergedCatalogForGroup` call re-reads the lineage
   * table (US-173 Scenario 4).
   */
  invalidateGroupCatalogCache(groupId: string): void {
    this.catalogCache.invalidate(groupId);
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    // --- Stages 1 + 2: shared parser (jsdoc-parse + signature-semantics).
    const parsed = parseDynamicNodeSignature(input.script);
    if (parsed.errors.length > 0 || parsed.entry === null) {
      throw new PublishValidationError(parsed.errors);
    }
    const entry = parsed.entry;
    const slug = entry.dynamicNodeSlug;
    if (slug === undefined) {
      // Defensive — parseDynamicNodeSignature always sets `dynamicNodeSlug`
      // when `entry` is non-null. Surface as an internal parse failure.
      throw new PublishValidationError([
        {
          stage: "signature-semantics",
          message: "Parser did not produce a slug",
        },
      ]);
    }

    // Update-mode requires `@name` to match the path slug.
    if (input.mode === "update" && input.pathSlug !== undefined) {
      if (input.pathSlug !== slug) {
        throw new NameMismatchError(input.pathSlug, slug);
      }
    }

    // --- Stage 3: ts-check via the deno-runner sidecar.
    const checkResponse = await this.denoRunnerClient.check(input.script);
    if (!checkResponse.ok || checkResponse.errors.length > 0) {
      const errors: TsCheckError[] = checkResponse.errors.map((e) => ({
        stage: "ts-check",
        line: e.line,
        column: e.column,
        message: e.message,
      }));
      throw new PublishValidationError(errors);
    }

    // --- Stage 4: allowlist intersection.
    const declaredHosts = entry.allowNet ?? [];
    const allowlistErrors = this.validateAllowlist(declaredHosts);
    if (allowlistErrors.length > 0) {
      throw new PublishValidationError(allowlistErrors);
    }

    // --- Stage 5: persist + return.
    const signature = entryToSignature(entry);
    if (input.mode === "create") {
      const created = await this.repository.createWithFirstVersion({
        groupId: input.groupId,
        slug,
        description: signature.description,
        script: input.script,
        signature,
        allowNet: declaredHosts,
        deterministic: signature.deterministic,
        ownerUserId: input.actorUserId,
      });
      return {
        slug,
        version: created.headVersion.versionNumber,
        signature,
      };
    }

    const updated = await this.repository.publishNewVersion({
      groupId: input.groupId,
      slug,
      description: signature.description,
      script: input.script,
      signature,
      allowNet: declaredHosts,
      deterministic: signature.deterministic,
      publishedByUserId: input.actorUserId,
    });
    return {
      slug,
      version: updated.headVersion.versionNumber,
      signature,
    };
  }

  /**
   * Check each declared host in `@allowNet` against the global allowlist.
   * Returns one `AllowlistError` per rejected host. Empty list = pass.
   */
  private validateAllowlist(declaredHosts: string[]): ParseError[] {
    const errors: ParseError[] = [];
    for (const host of declaredHosts) {
      if (!this.globalAllowlist.has(host)) {
        errors.push({
          stage: "allowlist",
          rejectedHost: host,
          message: `Host '${host}' is not in the global allowlist (DYNAMIC_NODE_ALLOW_NET)`,
        });
      }
    }
    return errors;
  }
}

/**
 * Translate the parsed `ActivityCatalogEntry` (the parser's output) into
 * the `DynamicNodeSignature` shape stored on `DynamicNodeVersion.signature`.
 *
 * The two shapes overlap heavily — `DynamicNodeSignature` is the "stored
 * subset" of the parsed entry. We deliberately do NOT store the whole
 * entry: derived fields like `activityType`, `iconHint`, `colorHint`,
 * `dynamicNodeVersion` are reconstructed at the catalog-merge step (US-173)
 * from the stored signature + lineage metadata. Storing them would be
 * redundant.
 */
function entryToSignature(
  entry: ActivityCatalogEntry & { timeoutMs?: number; maxMemoryMB?: number },
): DynamicNodeSignature {
  return {
    name: entry.dynamicNodeSlug ?? "",
    description: entry.description,
    category:
      typeof entry.category === "string"
        ? entry.category
        : (entry.category as string),
    deterministic: entry.nonCacheable === false,
    inputs: entry.inputs.map(portToDynamicPort),
    outputs: entry.outputs.map(portToDynamicPort),
    paramsSchema: entry.paramsSchema ?? {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    allowNet: entry.allowNet ?? [],
    timeoutMs: entry.timeoutMs ?? 60_000,
    maxMemoryMB: entry.maxMemoryMB ?? 256,
  };
}

function portToDynamicPort(port: {
  name: string;
  kind?: string;
  required?: boolean;
  description?: string;
}): DynamicNodePort {
  return {
    name: port.name,
    kind: port.kind ?? "Artifact",
    required: port.required,
    description: port.description,
  };
}

/**
 * Build an `ActivityCatalogEntry` from a stored `DynamicNodeSignature` +
 * the lineage's head version number. The inverse of `entryToSignature`.
 *
 * Surfaces:
 *  - `activityType: "dyn.<slug>"` so the frontend's catalog lookup hits
 *    the same key the workflow graph stores.
 *  - `dynamicNodeSlug` + `dynamicNodeVersion` for the DYN pill,
 *    settings panel, and binding-walk version-pin path.
 *  - `colorHint: "dyn"` so the palette/canvas render dynamic entries
 *    distinctly without inspecting the slug.
 *
 * Ports default `kind` to `"Artifact"` defensively (mirrors the
 * dynamic-node parser's default — every published port has an explicit
 * kind, but the type allows undefined for forward compatibility).
 */
export function signatureToCatalogEntry(
  signature: DynamicNodeSignature,
  versionNumber: number,
): ActivityCatalogEntry {
  return {
    activityType: `dyn.${signature.name}`,
    category: signature.category,
    description: signature.description,
    iconHint: "dyn",
    colorHint: "dyn",
    inputs: signature.inputs.map((port) => ({
      name: port.name,
      label: port.name,
      description: port.description,
      required: port.required,
      // The signature's `kind` is a raw string validated against the
      // ArtifactKind registry at publish time (US-159). It is safe to
      // narrow to `KindRef` here.
      kind: port.kind as KindRef,
    })),
    outputs: signature.outputs.map((port) => ({
      name: port.name,
      label: port.name,
      description: port.description,
      required: port.required,
      kind: port.kind as KindRef,
    })),
    paramsSchema: signature.paramsSchema,
    nonCacheable: !signature.deterministic,
    dynamicNodeSlug: signature.name,
    dynamicNodeVersion: versionNumber,
    allowNet: signature.allowNet,
  };
}

/**
 * Parse `DYNAMIC_NODE_ALLOW_NET` (comma-separated) into a set of host
 * patterns. Whitespace around each entry is trimmed; empty entries are
 * dropped.
 */
function parseGlobalAllowlist(raw: string | undefined): ReadonlySet<string> {
  if (raw === undefined || raw.trim() === "") {
    return new Set();
  }
  const hosts = raw
    .split(",")
    .map((h) => h.trim())
    .filter((h) => h !== "");
  return new Set(hosts);
}
