import {
  AUTO_CTX_KEY_PREFIX,
  getActivityCatalogEntry,
  getLockedInputPorts,
  isAutoCtxKey,
  type KindRef,
  type PortResolution,
  resolveInputPort,
  synthesiseCtxKey,
} from "@ai-di/graph-workflow";
import { Badge, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useState } from "react";
import type { GraphNode, GraphWorkflowConfig } from "../../../types/workflow";
import { ProducerPicker } from "../graph-widgets/ProducerPicker";

interface InputsSectionProps {
  config: GraphWorkflowConfig;
  nodeId: string;
  onConfigChange: (next: GraphWorkflowConfig) => void;
}

/**
 * Decode the producer node ID from an auto ctx key of the form
 * `__auto.{nodeId}.{port}`.  Returns null if the key is not an auto key.
 */
function decodeAutoProducerNodeId(ctxKey: string): string | null {
  if (!ctxKey.startsWith(AUTO_CTX_KEY_PREFIX)) return null;
  // "__auto.{nodeId}.{port}" — nodeId may contain dots, but port is the last
  // segment. We at least need the first segment after the prefix.
  const withoutPrefix = ctxKey.slice(AUTO_CTX_KEY_PREFIX.length);
  const dotIdx = withoutPrefix.indexOf(".");
  if (dotIdx === -1) return null;
  return withoutPrefix.slice(0, dotIdx);
}

/**
 * Effective resolution for a port row: when `resolveInputPort` returns
 * "ambiguous" but the consumer already has an auto-key binding for this
 * port (left over from a previous auto-wire pass), we display the existing
 * binding as "auto-bound" so the user sees where their data comes from and
 * can choose to Override or leave it.
 */
function effectiveResolution(
  rawResolution: PortResolution,
  existingCtxKey: string | undefined,
  config: GraphWorkflowConfig,
): PortResolution {
  if (
    rawResolution.status === "ambiguous" &&
    existingCtxKey &&
    isAutoCtxKey(existingCtxKey)
  ) {
    const producerNodeId = decodeAutoProducerNodeId(existingCtxKey);
    if (producerNodeId && config.nodes[producerNodeId]) {
      // Determine the producer port from the ctxKey suffix
      const withoutPrefix = existingCtxKey.slice(AUTO_CTX_KEY_PREFIX.length);
      const dotIdx = withoutPrefix.indexOf(".");
      const producerPort = dotIdx !== -1 ? withoutPrefix.slice(dotIdx + 1) : "";
      return {
        status: "auto-bound",
        producerNodeId,
        producerPort,
      };
    }
  }
  return rawResolution;
}

export function InputsSection({
  config,
  nodeId,
  onConfigChange,
}: InputsSectionProps) {
  const [overrideOf, setOverrideOf] = useState<string | null>(null);
  const node = config.nodes[nodeId];
  if (!node || (node.type !== "activity" && node.type !== "pollUntil")) {
    return null;
  }
  const activityType = node.activityType;
  const entry = getActivityCatalogEntry(activityType);
  if (!entry) return null;

  const handleOverride = (
    portName: string,
    selection: { producerNodeId: string; producerPort: string },
  ) => {
    const producer = config.nodes[selection.producerNodeId];
    if (!producer) return;
    const existingOutputBinding = producer.outputs?.find(
      (b) => b.port === selection.producerPort,
    );
    const ctxKey =
      existingOutputBinding?.ctxKey ??
      synthesiseCtxKey(selection.producerNodeId, selection.producerPort);
    const nextProducerOutputs = existingOutputBinding
      ? (producer.outputs ?? [])
      : [...(producer.outputs ?? []), { port: selection.producerPort, ctxKey }];
    const nextConsumerInputs = [
      ...(node.inputs ?? []).filter((b) => b.port !== portName),
      { port: portName, ctxKey },
    ];
    const existingLocks = getLockedInputPorts(node);
    const nextLocks = Array.from(new Set([...existingLocks, portName]));
    onConfigChange({
      ...config,
      nodes: {
        ...config.nodes,
        [selection.producerNodeId]: {
          ...producer,
          outputs: nextProducerOutputs,
        } as GraphNode,
        [nodeId]: {
          ...node,
          inputs: nextConsumerInputs,
          metadata: {
            ...(node.metadata ?? {}),
            lockedInputPorts: nextLocks,
          },
        } as GraphNode,
      },
    });
    setOverrideOf(null);
  };

  const handleRevert = (portName: string) => {
    const existingLocks = getLockedInputPorts(node);
    const nextLocks = existingLocks.filter((p) => p !== portName);
    const nextMetadata: Record<string, unknown> = { ...(node.metadata ?? {}) };
    if (nextLocks.length > 0) {
      nextMetadata.lockedInputPorts = nextLocks;
    } else {
      delete nextMetadata.lockedInputPorts;
    }
    onConfigChange({
      ...config,
      nodes: {
        ...config.nodes,
        [nodeId]: {
          ...node,
          metadata: nextMetadata,
        } as GraphNode,
      },
    });
  };

  return (
    <Stack gap={4}>
      <Text size="xs" fw={600}>
        Inputs
      </Text>
      {entry.inputs.length === 0 && (
        <Text size="10px" c="dimmed">
          None.
        </Text>
      )}
      {entry.inputs.map((port) => {
        const portKind = port.kind as KindRef | undefined;
        const rawResolution = resolveInputPort(config, nodeId, {
          name: port.name,
          kind: portKind,
        });
        const existingCtxKey = node.inputs?.find(
          (b) => b.port === port.name,
        )?.ctxKey;
        const resolution = effectiveResolution(
          rawResolution,
          existingCtxKey,
          config,
        );
        return (
          <PortRow
            key={port.name}
            portLabel={port.label}
            resolution={resolution}
            producerLabel={
              resolution.status === "auto-bound"
                ? (config.nodes[resolution.producerNodeId]?.label ??
                  resolution.producerNodeId)
                : null
            }
            onOverride={() => setOverrideOf(port.name)}
            onRevert={() => handleRevert(port.name)}
          />
        );
      })}

      <Modal
        opened={overrideOf !== null}
        onClose={() => setOverrideOf(null)}
        title="Choose source"
        size="sm"
        transitionProps={{ duration: 0 }}
      >
        {overrideOf && (
          <ProducerPicker
            config={config}
            consumerNodeId={nodeId}
            expectedKind={
              (entry.inputs.find((p) => p.name === overrideOf)?.kind ??
                "Artifact") as KindRef
            }
            value=""
            onChange={(selection) => {
              if (selection) handleOverride(overrideOf, selection);
            }}
          />
        )}
      </Modal>
    </Stack>
  );
}

interface PortRowProps {
  portLabel: string;
  resolution: PortResolution;
  producerLabel: string | null;
  onOverride: () => void;
  onRevert: () => void;
}

function PortRow({
  portLabel,
  resolution,
  producerLabel,
  onOverride,
  onRevert,
}: PortRowProps) {
  const renderBody = () => {
    switch (resolution.status) {
      case "auto-bound":
        return (
          <Group gap={6} wrap="nowrap">
            <Text size="xs">←</Text>
            <Text size="xs">{producerLabel}</Text>
            <Badge size="xs" color="green" variant="light">
              auto
            </Badge>
            <Button size="compact-xs" variant="subtle" onClick={onOverride}>
              Override
            </Button>
          </Group>
        );
      case "ambiguous":
        return (
          <Button
            size="compact-xs"
            color="yellow"
            variant="light"
            onClick={onOverride}
          >
            Choose source
          </Button>
        );
      case "unsatisfied":
        return (
          <Button
            size="compact-xs"
            color="red"
            variant="light"
            onClick={onOverride}
          >
            Needs source
          </Button>
        );
      case "locked":
        return (
          <Group gap={6} wrap="nowrap">
            <Text size="xs">{resolution.ctxKey}</Text>
            <Badge size="xs" color="gray" variant="light">
              locked
            </Badge>
            <Button size="compact-xs" variant="subtle" onClick={onRevert}>
              Revert to auto
            </Button>
          </Group>
        );
    }
  };

  return (
    <Group gap={8} wrap="nowrap" justify="space-between">
      <Text size="xs" fw={500}>
        {portLabel}
      </Text>
      {renderBody()}
    </Group>
  );
}
