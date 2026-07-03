import type { GraphWorkflowConfig } from "./graph-workflow-types";

const LEGACY_CTX_KEYS = ["ocrResponse", "ocrResult", "cleanedResult"] as const;

const RENAME_MAP: Record<string, string> = {
  ocrResponse: "ocrResponseRef",
  ocrResult: "ocrResultRef",
  cleanedResult: "cleanedResultRef",
};

function renameKey(key: string): string {
  return RENAME_MAP[key] ?? key;
}

const EXTRACT_TO_BASE64_ACTIVITY = "document.extractToBase64";

/** Rename ctx keys that held inline base64 from `document.extractToBase64`. */
export function renameBase64ExtractCtxKey(ctxKey: string): string {
  if (ctxKey.endsWith("Base64")) {
    return `${ctxKey.slice(0, -6)}PageBlobPath`;
  }
  if (ctxKey.endsWith("base64")) {
    return `${ctxKey.slice(0, -6)}pageBlobPath`;
  }
  return `${ctxKey}PageBlobPath`;
}

function migrateFieldMappingForRenamedKeys(
  value: string,
  keyRenames: Map<string, string>,
): string {
  let result = migrateFieldMappingString(value);
  for (const [oldKey, newKey] of keyRenames) {
    result = result.replace(
      new RegExp(`\\{\\{${oldKey}\\.`, "g"),
      `{{${newKey}.`,
    );
    result = result.replace(
      new RegExp(`\\{\\{ctx\\.${oldKey}\\.`, "g"),
      `{{ctx.${newKey}.`,
    );
  }
  return result;
}

function walkTransformMappingsWithRenames(
  value: unknown,
  keyRenames: Map<string, string>,
): unknown {
  if (typeof value === "string") {
    return migrateFieldMappingForRenamedKeys(value, keyRenames);
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      walkTransformMappingsWithRenames(item, keyRenames),
    );
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = walkTransformMappingsWithRenames(v, keyRenames);
    }
    return out;
  }
  return value;
}

function collectExtractToBase64KeyRenames(
  config: GraphWorkflowConfig,
): Map<string, string> {
  const renames = new Map<string, string>();
  for (const node of Object.values(config.nodes ?? {})) {
    const activityNode = node as {
      activityType?: string;
      outputs?: Array<{ port?: string; ctxKey?: string }>;
    };
    if (activityNode.activityType !== EXTRACT_TO_BASE64_ACTIVITY) {
      continue;
    }
    for (const output of activityNode.outputs ?? []) {
      if (output.port === "base64" && typeof output.ctxKey === "string") {
        renames.set(output.ctxKey, renameBase64ExtractCtxKey(output.ctxKey));
      }
    }
  }
  return renames;
}

function applyCtxKeyRenames(key: string, renames: Map<string, string>): string {
  return renames.get(key) ?? renameKey(key);
}

function migrateNodeWithRenames(
  node: Record<string, unknown>,
  keyRenames: Map<string, string>,
): Record<string, unknown> {
  const activityType = node.activityType as string | undefined;
  const migrated = migrateNode(node);

  if (Array.isArray(migrated.inputs)) {
    migrated.inputs = (migrated.inputs as Array<Record<string, unknown>>).map(
      (input) => ({
        ...input,
        ctxKey:
          typeof input.ctxKey === "string"
            ? applyCtxKeyRenames(input.ctxKey, keyRenames)
            : input.ctxKey,
      }),
    );
  }

  if (activityType === EXTRACT_TO_BASE64_ACTIVITY) {
    const inputs = [
      ...((migrated.inputs as Array<Record<string, unknown>>) ?? []),
    ];
    const inputPorts = new Set(
      inputs
        .map((i) => i.port)
        .filter((p): p is string => typeof p === "string"),
    );
    if (!inputPorts.has("groupId")) {
      inputs.push({ port: "groupId", ctxKey: "groupId" });
    }
    if (!inputPorts.has("documentId")) {
      inputs.push({ port: "documentId", ctxKey: "documentId" });
    }
    migrated.inputs = inputs;
  }

  if (
    activityType === EXTRACT_TO_BASE64_ACTIVITY &&
    Array.isArray(migrated.outputs)
  ) {
    migrated.outputs = (migrated.outputs as Array<Record<string, unknown>>).map(
      (output) => {
        if (output.port === "base64") {
          const oldKey =
            typeof output.ctxKey === "string" ? output.ctxKey : "pageBlobPath";
          const newKey =
            keyRenames.get(oldKey) ?? renameBase64ExtractCtxKey(oldKey);
          return { ...output, port: "pageBlobPath", ctxKey: newKey };
        }
        return {
          ...output,
          ctxKey:
            typeof output.ctxKey === "string"
              ? applyCtxKeyRenames(output.ctxKey, keyRenames)
              : output.ctxKey,
        };
      },
    );
  } else if (Array.isArray(migrated.outputs)) {
    migrated.outputs = (migrated.outputs as Array<Record<string, unknown>>).map(
      (output) => ({
        ...output,
        ctxKey:
          typeof output.ctxKey === "string"
            ? applyCtxKeyRenames(output.ctxKey, keyRenames)
            : output.ctxKey,
      }),
    );
  }

  if (migrated.parameters && typeof migrated.parameters === "object") {
    migrated.parameters = walkTransformMappingsWithRenames(
      migrated.parameters,
      keyRenames,
    );
  }

  if (migrated.condition) {
    migrated.condition = walkConditionRefs(migrated.condition);
  }

  return migrated;
}

/**
 * Migrate `document.extractToBase64` port `base64` → `pageBlobPath` and related ctx keys.
 */
export function migrateExtractToBase64Bindings(
  config: GraphWorkflowConfig,
): GraphWorkflowConfig {
  const keyRenames = collectExtractToBase64KeyRenames(config);
  if (keyRenames.size === 0) {
    return config;
  }

  const ctx: GraphWorkflowConfig["ctx"] = {};
  for (const [key, decl] of Object.entries(config.ctx ?? {})) {
    const newKey = keyRenames.get(key) ?? key;
    ctx[newKey] = decl;
  }

  const nodes: GraphWorkflowConfig["nodes"] = {};
  for (const [nodeId, node] of Object.entries(config.nodes ?? {})) {
    nodes[nodeId] = migrateNodeWithRenames(
      node as unknown as Record<string, unknown>,
      keyRenames,
    ) as unknown as GraphWorkflowConfig["nodes"][string];
  }

  return { ...config, ctx, nodes };
}

function walkConditionRefs(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => walkConditionRefs(item));
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === "ref" && typeof v === "string") {
        let ref = v;
        for (const legacy of LEGACY_CTX_KEYS) {
          ref = ref.replace(
            new RegExp(`ctx\\.${legacy}(\\.|$)`, "g"),
            `ctx.${RENAME_MAP[legacy]}$1`,
          );
          ref = ref.replace(
            new RegExp(`^${legacy}(\\.|$)`),
            `${RENAME_MAP[legacy]}$1`,
          );
        }
        out[k] = ref;
      } else {
        out[k] = walkConditionRefs(v);
      }
    }
    return out;
  }
  return value;
}

function migrateFieldMappingString(s: string): string {
  let result = s;
  for (const legacy of LEGACY_CTX_KEYS) {
    result = result.replace(
      new RegExp(`\\{\\{${legacy}\\.`, "g"),
      `{{${RENAME_MAP[legacy]}.`,
    );
    result = result.replace(
      new RegExp(`\\{\\{ctx\\.${legacy}\\.`, "g"),
      `{{ctx.${RENAME_MAP[legacy]}.`,
    );
  }
  return result;
}

function walkTransformMappings(value: unknown): unknown {
  if (typeof value === "string") {
    return migrateFieldMappingString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => walkTransformMappings(item));
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = walkTransformMappings(v);
    }
    return out;
  }
  return value;
}

function migrateNode(node: Record<string, unknown>): Record<string, unknown> {
  const migrated: Record<string, unknown> = { ...node };

  if (Array.isArray(node.inputs)) {
    migrated.inputs = (node.inputs as Array<Record<string, unknown>>).map(
      (input) => ({
        ...input,
        ctxKey:
          typeof input.ctxKey === "string"
            ? renameKey(input.ctxKey)
            : input.ctxKey,
      }),
    );
  }

  if (Array.isArray(node.outputs)) {
    migrated.outputs = (node.outputs as Array<Record<string, unknown>>).map(
      (output) => ({
        ...output,
        ctxKey:
          typeof output.ctxKey === "string"
            ? renameKey(output.ctxKey)
            : output.ctxKey,
      }),
    );
  }

  if (node.condition) {
    migrated.condition = walkConditionRefs(node.condition);
  }

  if (node.parameters && typeof node.parameters === "object") {
    migrated.parameters = walkTransformMappings(node.parameters);
  }

  return migrated;
}

/**
 * Migrate graph config ctx keys and bindings from inline OCR keys to *Ref keys.
 * Idempotent: will not produce ocrResultRefRef.
 */
export function migrateGraphConfigToOcrRefs(
  config: GraphWorkflowConfig,
): GraphWorkflowConfig {
  const ctx: GraphWorkflowConfig["ctx"] = {};
  for (const [key, decl] of Object.entries(config.ctx ?? {})) {
    ctx[renameKey(key)] = decl;
  }

  const nodes: GraphWorkflowConfig["nodes"] = {};
  for (const [nodeId, node] of Object.entries(config.nodes ?? {})) {
    nodes[nodeId] = migrateNode(
      node as unknown as Record<string, unknown>,
    ) as unknown as GraphWorkflowConfig["nodes"][string];
  }

  return migrateExtractToBase64Bindings({
    ...config,
    ctx,
    nodes,
  });
}

export interface LegacyOcrKeyViolation {
  path: string;
  key: string;
}

/** Structured gate: find legacy ctx key names still present after migration. */
export function findLegacyOcrIdentifiers(
  config: unknown,
  path = "config",
): LegacyOcrKeyViolation[] {
  const violations: LegacyOcrKeyViolation[] = [];

  const visit = (value: unknown, currentPath: string): void => {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        visit(value[i], `${currentPath}[${i}]`);
      }
      return;
    }
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) {
        if (
          (k === "ctxKey" || k.endsWith("CtxKey") || k === "ref") &&
          typeof v === "string" &&
          LEGACY_CTX_KEYS.includes(v as (typeof LEGACY_CTX_KEYS)[number])
        ) {
          violations.push({ path: `${currentPath}.${k}`, key: v });
        }
        if (k === "ref" && typeof v === "string") {
          for (const legacy of LEGACY_CTX_KEYS) {
            const needle = `ctx.${legacy}`;
            if (
              v === needle ||
              v.startsWith(`${needle}.`) ||
              v.startsWith(`${needle}[`)
            ) {
              violations.push({ path: `${currentPath}.${k}`, key: v });
              break;
            }
          }
        }
        if (
          currentPath.endsWith(".ctx") &&
          LEGACY_CTX_KEYS.includes(k as (typeof LEGACY_CTX_KEYS)[number])
        ) {
          violations.push({ path: `${currentPath}.${k}`, key: k });
        }
        visit(v, `${currentPath}.${k}`);
      }
    }
  };

  visit(config, path);
  return violations;
}
