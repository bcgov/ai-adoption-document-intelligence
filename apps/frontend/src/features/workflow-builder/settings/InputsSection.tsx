import { getActivityCatalogEntry, type KindRef } from "@ai-di/graph-workflow";
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
import {
  type PinnedSource,
  type RowResolution,
  resolvePinnedSource,
  resolveWireableInputRows,
} from "./input-row-resolution";

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

  // Two port populations get a row: auto-wireable typed ports (as before),
  // plus REQUIRED base-`Artifact` identifier ports — the amber ring already
  // fires for these on canvas, so the settings panel must surface them too
  // (ring/badge reconciliation, PORT_WIRING §4.2). Optional identifier ports
  // stay invisible.
  const rows = resolveWireableInputRows(config, nodeId);
  const activePickerPortLabel =
    activePickerPort != null
      ? (rows.find((r) => r.port.name === activePickerPort)?.port.label ??
        activePickerPort)
      : null;

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
      {rows.length === 0 && (
        <Text size="10px" c="dimmed">
          None.
        </Text>
      )}
      {rows.map(({ port, resolution }) => (
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
          pinnedSource={
            resolution.status === "locked"
              ? resolvePinnedSource(config, resolution.ctxKey)
              : null
          }
          onOverride={() => setOverrideOf(port.name)}
          onRevert={() => handleRevert(port.name)}
        />
      ))}

      <Modal
        opened={activePickerPort !== null}
        onClose={closePicker}
        title={
          activePickerPortLabel
            ? `Choose a source for "${activePickerPortLabel}"`
            : "Choose a source"
        }
        size="sm"
        transitionProps={{ duration: 0 }}
      >
        {activePickerPort && (
          <ProducerPicker
            config={config}
            consumerNodeId={nodeId}
            expectedKind={
              (rows.find((r) => r.port.name === activePickerPort)?.port.kind ??
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
  resolution: RowResolution;
  producerLabel: string | null;
  /** Friendly source for a `locked` (pinned) row; null for other statuses. */
  pinnedSource: PinnedSource | null;
  onOverride: () => void;
  onRevert: () => void;
}

function PortRow({
  portLabel,
  resolution,
  producerLabel,
  pinnedSource,
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
            {pinnedSource?.via === "ctx" ? (
              <Text size="xs">from {pinnedSource.ctxKey}</Text>
            ) : (
              <>
                <Text size="xs">←</Text>
                <Text size="xs">
                  {pinnedSource?.label ?? resolution.ctxKey}
                </Text>
              </>
            )}
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
      case "locked-unbound":
        return (
          <Group gap={6} wrap="nowrap">
            <Tooltip label="Disconnected by you">
              <Badge size="xs" color="gray" variant="light">
                Disconnected
              </Badge>
            </Tooltip>
            <Button size="compact-xs" variant="light" onClick={onOverride}>
              Pick a source
            </Button>
            <Button size="compact-xs" variant="subtle" onClick={onRevert}>
              Revert to automatic
            </Button>
          </Group>
        );
      case "ctx-bound":
        // Unlocked but bound to a real ctx variable — the port HAS a source
        // (parity with the drawer's manuallyBoundPorts suppression). Show the
        // binding rather than the misleading red "Needs a source" button.
        return (
          <Group gap={6} wrap="nowrap">
            <Text size="xs">from {resolution.ctxKey}</Text>
            <Button size="compact-xs" variant="subtle" onClick={onOverride}>
              Change source
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
