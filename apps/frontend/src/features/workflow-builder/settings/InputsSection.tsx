import {
  AUTO_CTX_KEY_PREFIX,
  getActivityCatalogEntry,
  isAutoCtxKey,
  type KindRef,
  type PortResolution,
  resolveInputPort,
  shouldAutoWirePort,
} from "@ai-di/graph-workflow";
import {
  Badge,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { useState } from "react";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import {
  pinPortBinding,
  revertPortToAutomatic,
} from "../canvas/wire-mutations";
import { ProducerPicker } from "../graph-widgets/ProducerPicker";

interface InputsSectionProps {
  config: GraphWorkflowConfig;
  nodeId: string;
  onConfigChange: (next: GraphWorkflowConfig) => void;
  /**
   * When set, open the source picker for this input port on arrival — the
   * deep-link a clicked status dot uses to jump straight to the problem
   * input. Consumed once (see `onFocusConsumed`) so a re-render doesn't
   * re-open it.
   */
  focusPort?: string | null;
  /** Called right after `focusPort` is applied so the caller can clear it. */
  onFocusConsumed?: () => void;
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
 * can choose to change the source or leave it.
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
        // The original binding mechanism isn't recoverable from a stale
        // auto ctx key alone (only producer node/port survive); default to
        // the most common mechanism rather than guessing a misleading one.
        via: "nearest-kind",
      };
    }
  }
  return rawResolution;
}

export function InputsSection({
  config,
  nodeId,
  onConfigChange,
  focusPort,
  onFocusConsumed,
}: InputsSectionProps) {
  const [overrideOf, setOverrideOf] = useState<string | null>(null);

  // The picker is open for the port the user clicked "Change source" on
  // (`overrideOf`) OR the port a clicked status dot deep-linked to
  // (`focusPort`). Deriving the open port from the prop — rather than copying
  // it into state via an effect — keeps the deep-link resilient to remounts
  // (a mount effect that cleared the parent signal would lose it under a
  // React StrictMode double-mount). Both the picker's close and a successful
  // pick clear `overrideOf` and call `onFocusConsumed`, so it never re-opens.
  const activePickerPort = overrideOf ?? focusPort ?? null;
  const closePicker = () => {
    setOverrideOf(null);
    onFocusConsumed?.();
  };

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
    const next = pinPortBinding(config, nodeId, portName, selection);
    if (next !== config) onConfigChange(next);
    closePicker();
  };

  const handleRevert = (portName: string) => {
    onConfigChange(revertPortToAutomatic(config, nodeId, portName));
  };

  return (
    <Stack gap={4} data-testid="inputs-section">
      <Text size="xs" fw={600}>
        Inputs
      </Text>
      {entry.inputs.filter(shouldAutoWirePort).length === 0 && (
        <Text size="10px" c="dimmed">
          None.
        </Text>
      )}
      {entry.inputs.filter(shouldAutoWirePort).map((port) => {
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
        opened={activePickerPort !== null}
        onClose={closePicker}
        title="Choose a source"
        size="sm"
        transitionProps={{ duration: 0 }}
      >
        {activePickerPort && (
          <ProducerPicker
            config={config}
            consumerNodeId={nodeId}
            expectedKind={
              (entry.inputs.find((p) => p.name === activePickerPort)?.kind ??
                "Artifact") as KindRef
            }
            value=""
            onChange={(selection) => {
              if (selection) handleOverride(activePickerPort, selection);
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
            <Tooltip label="Connected automatically">
              <Badge size="xs" color="green" variant="light">
                Auto
              </Badge>
            </Tooltip>
            <Button size="compact-xs" variant="subtle" onClick={onOverride}>
              Change source
            </Button>
          </Group>
        );
      case "ambiguous":
        return (
          <Tooltip label="Multiple possible sources">
            <Button
              size="compact-xs"
              color="yellow"
              variant="light"
              onClick={onOverride}
            >
              Pick a source
            </Button>
          </Tooltip>
        );
      case "unsatisfied":
        return (
          <Tooltip label="Choose where this comes from">
            <Button
              size="compact-xs"
              color="red"
              variant="light"
              onClick={onOverride}
            >
              Needs a source
            </Button>
          </Tooltip>
        );
      case "locked":
        return (
          <Group gap={6} wrap="nowrap">
            <Text size="xs">{resolution.ctxKey}</Text>
            <Tooltip label="Pinned by you">
              <Badge size="xs" color="gray" variant="light">
                Pinned
              </Badge>
            </Tooltip>
            <Button size="compact-xs" variant="subtle" onClick={onRevert}>
              Revert to automatic
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
