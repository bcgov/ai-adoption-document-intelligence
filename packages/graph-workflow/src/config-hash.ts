import { createHash } from "node:crypto";
import type {
  ActivityNode,
  ChildWorkflowNode,
  GraphNode,
  GraphWorkflowConfig,
  PollUntilNode,
  SwitchNode,
} from "./types";
import { applyWorkflowConfigOverrides } from "./workflow-config-overrides";

const DEFAULT_ACTIVITY_RETRY = { maximumAttempts: 3 };
const DEFAULT_ACTIVITY_TIMEOUT = { startToClose: "2m" };
const DEFAULT_POLL_MAX_ATTEMPTS = 100;

/** Config without persisted `metadata.configHash` (not part of hash input). */
export function stripPersistedConfigHash(
  config: GraphWorkflowConfig,
): GraphWorkflowConfig {
  const { configHash: _ignored, ...metadataRest } = config.metadata ?? {};
  return {
    ...config,
    metadata: {
      ...metadataRest,
      tags: config.metadata?.tags ?? [],
    },
  };
}

export function computeConfigHash(config: GraphWorkflowConfig): string {
  const normalized = applyDefaults(stripPersistedConfigHash(config));
  const sorted = sortKeys(normalized);
  const payload = JSON.stringify(sorted);
  return createHash("sha256").update(payload).digest("hex");
}

/** Hash after applying optional exposed-param overrides (benchmark / ground truth). */
export function computeConfigHashWithOverrides(
  config: GraphWorkflowConfig,
  overrides?: Record<string, unknown> | null,
): string {
  if (!overrides || Object.keys(overrides).length === 0) {
    return computeConfigHash(config);
  }
  return computeConfigHash(applyWorkflowConfigOverrides(config, overrides));
}

/** Persist `metadata.configHash` on configs written to `workflow_versions`. */
export function stampConfigWithPersistedHash(
  config: GraphWorkflowConfig,
): GraphWorkflowConfig {
  const stripped = stripPersistedConfigHash(config);
  const configHash = computeConfigHash(stripped);
  return {
    ...stripped,
    metadata: {
      ...stripped.metadata,
      configHash,
    },
  };
}

function applyDefaults(config: GraphWorkflowConfig): GraphWorkflowConfig {
  return {
    schemaVersion: config.schemaVersion,
    metadata: {
      ...config.metadata,
      tags: config.metadata?.tags ?? [],
    },
    nodes: Object.fromEntries(
      Object.entries(config.nodes).map(([nodeId, node]) => [
        nodeId,
        applyNodeDefaults(node),
      ]),
    ),
    edges: config.edges ?? [],
    entryNodeId: config.entryNodeId,
    ctx: config.ctx,
  };
}

function applyNodeDefaults(node: GraphNode): GraphNode {
  const base = {
    ...node,
    inputs: node.inputs ?? [],
    outputs: node.outputs ?? [],
  };

  switch (node.type) {
    case "activity": {
      const activityNode = node as ActivityNode;
      return {
        ...base,
        parameters: activityNode.parameters ?? {},
        retry: activityNode.retry ?? DEFAULT_ACTIVITY_RETRY,
        timeout: activityNode.timeout ?? DEFAULT_ACTIVITY_TIMEOUT,
      } as ActivityNode;
    }
    case "pollUntil": {
      const pollNode = node as PollUntilNode;
      return {
        ...base,
        parameters: pollNode.parameters ?? {},
        maxAttempts: pollNode.maxAttempts ?? DEFAULT_POLL_MAX_ATTEMPTS,
      } as PollUntilNode;
    }
    case "childWorkflow": {
      const childNode = node as ChildWorkflowNode;
      return {
        ...base,
        inputMappings: childNode.inputMappings ?? [],
        outputMappings: childNode.outputMappings ?? [],
      } as ChildWorkflowNode;
    }
    case "switch": {
      const switchNode = node as SwitchNode;
      return {
        ...base,
        cases: switchNode.cases ?? [],
      } as SwitchNode;
    }
    default:
      return base;
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeys(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const child = obj[key];
    if (child === undefined) {
      continue;
    }
    sorted[key] = sortKeys(child);
  }
  return sorted;
}
