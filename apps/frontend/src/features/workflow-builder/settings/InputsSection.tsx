import { getActivityCatalogEntry, type KindRef } from "@ai-di/graph-workflow";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Menu,
  Modal,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconDots } from "@tabler/icons-react";
import { useState } from "react";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import {
  pinPortBinding,
  revertPortToAutomatic,
} from "../canvas/wire-mutations";
import { ProducerPicker } from "../graph-widgets/ProducerPicker";
import {
  decodeAutoProducerNodeId,
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
  /**
   * Item 6X — click a row that resolves to a REAL producer node to select
   * + pan/center that producer on the canvas. Fired with the producer's
   * node id. Only wired on interactive rows (see `producerNodeIdForRow`).
   */
  onJumpToProducer?: (nodeId: string) => void;
  /**
   * Item 6X — hover a real-producer row to highlight that producer on the
   * canvas. Fired with the producer's node id on mouse-enter and `null` on
   * mouse-leave.
   */
  onHoverProducer?: (nodeId: string | null) => void;
}

/**
 * The producer node id a row jumps/highlights to, or `null` when the row
 * has no real producer source (item 6X). A row is interactive ONLY when
 * this returns a live node id:
 *   - `auto-bound` → the resolver's `producerNodeId`.
 *   - `locked` bound to an `__auto.*` key → the decoded producer node id,
 *     guarded so a renamed/deleted producer (undecodable / missing node)
 *     falls back to non-interactive.
 * Every other status — `unsatisfied`, `ambiguous`, `locked-unbound`,
 * `ctx-bound`, and `locked` bound to a hand-authored (non-auto) ctx var —
 * has no producer node to point at, so returns `null`.
 */
function producerNodeIdForRow(
  resolution: RowResolution,
  config: GraphWorkflowConfig,
): string | null {
  if (resolution.status === "auto-bound") {
    return config.nodes[resolution.producerNodeId]
      ? resolution.producerNodeId
      : null;
  }
  if (resolution.status === "locked") {
    const decoded = decodeAutoProducerNodeId(resolution.ctxKey);
    if (decoded && config.nodes[decoded]) return decoded;
  }
  return null;
}

export function InputsSection({
  config,
  nodeId,
  onConfigChange,
  focusPort,
  onFocusConsumed,
  onJumpToProducer,
  onHoverProducer,
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
          portName={port.name}
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
          producerNodeId={producerNodeIdForRow(resolution, config)}
          onJumpToProducer={onJumpToProducer}
          onHoverProducer={onHoverProducer}
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
  portName: string;
  portLabel: string;
  resolution: RowResolution;
  producerLabel: string | null;
  /** Friendly source for a `locked` (pinned) row; null for other statuses. */
  pinnedSource: PinnedSource | null;
  /**
   * The producer node id this row jumps/highlights to, or `null` when the
   * row has no real producer source. Non-null makes the row interactive
   * (item 6X).
   */
  producerNodeId: string | null;
  onJumpToProducer?: (nodeId: string) => void;
  onHoverProducer?: (nodeId: string | null) => void;
  onOverride: () => void;
  onRevert: () => void;
}

function PortRow({
  portName,
  portLabel,
  resolution,
  producerLabel,
  pinnedSource,
  producerNodeId,
  onJumpToProducer,
  onHoverProducer,
  onOverride,
  onRevert,
}: PortRowProps) {
  // Only rows that resolve to a live producer node become interactive: a
  // click jumps to it, a hover highlights it. Rows without a producer stay
  // inert (no pointer, no testid, no handlers) — see `producerNodeIdForRow`.
  const interactive = producerNodeId !== null;
  const handleRowClick =
    interactive && onJumpToProducer
      ? () => onJumpToProducer(producerNodeId)
      : undefined;
  const handleRowEnter =
    interactive && onHoverProducer
      ? () => onHoverProducer(producerNodeId)
      : undefined;
  const handleRowLeave =
    interactive && onHoverProducer ? () => onHoverProducer(null) : undefined;
  // The `⋯` overflow-menu trigger, its menu items, and the inline primary
  // button must not also trigger the row-level jump. Wrapping the whole
  // trailing action cell in a `stopPropagation` click handler catches every
  // in-cell click (primary button + the menu trigger) before it bubbles to
  // the row container. Menu items render in a portal (outside this subtree),
  // so their clicks never reach the row anyway.
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  // Each status contributes up to three uniform slots — a middle
  // status/source body, an inline PRIMARY call-to-action button, and a set of
  // SECONDARY actions that live behind the `⋯` overflow menu — so every row
  // renders through the same 3-column grid and lines up down the panel.
  let middle: React.ReactNode = null;
  let primary: React.ReactNode = null;
  const menuActions: { key: string; label: string; onClick: () => void }[] = [];

  switch (resolution.status) {
    case "auto-bound":
      middle = (
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <Text size="xs">←</Text>
          <Text size="xs" truncate title={producerLabel ?? undefined}>
            {producerLabel}
          </Text>
          <Tooltip label="Connected automatically">
            <Badge size="xs" color="green" variant="light">
              Auto
            </Badge>
          </Tooltip>
        </Group>
      );
      menuActions.push({
        key: "change",
        label: "Change source",
        onClick: onOverride,
      });
      break;
    case "ambiguous":
      primary = (
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
      break;
    case "unsatisfied":
      primary = (
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
      break;
    case "locked":
      middle = (
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          {pinnedSource?.via === "ctx" ? (
            <Text size="xs" truncate title={`from ${pinnedSource.ctxKey}`}>
              from {pinnedSource.ctxKey}
            </Text>
          ) : (
            <>
              <Text size="xs">←</Text>
              <Text
                size="xs"
                truncate
                title={pinnedSource?.label ?? resolution.ctxKey}
              >
                {pinnedSource?.label ?? resolution.ctxKey}
              </Text>
            </>
          )}
          <Tooltip label="Pinned by you">
            <Badge size="xs" color="gray" variant="light">
              Pinned
            </Badge>
          </Tooltip>
        </Group>
      );
      menuActions.push({
        key: "change",
        label: "Change source",
        onClick: onOverride,
      });
      menuActions.push({
        key: "revert",
        label: "Revert to automatic",
        onClick: onRevert,
      });
      break;
    case "locked-unbound":
      middle = (
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <Tooltip label="Disconnected by you">
            <Badge size="xs" color="gray" variant="light">
              Disconnected
            </Badge>
          </Tooltip>
        </Group>
      );
      primary = (
        <Button size="compact-xs" variant="light" onClick={onOverride}>
          Pick a source
        </Button>
      );
      menuActions.push({
        key: "revert",
        label: "Revert to automatic",
        onClick: onRevert,
      });
      break;
    case "ctx-bound":
      // Unlocked but bound to a real ctx variable — the port HAS a source
      // (parity with the drawer's manuallyBoundPorts suppression). Show the
      // binding rather than the misleading red "Needs a source" button.
      middle = (
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <Text size="xs" truncate title={`from ${resolution.ctxKey}`}>
            from {resolution.ctxKey}
          </Text>
        </Group>
      );
      menuActions.push({
        key: "change",
        label: "Change source",
        onClick: onOverride,
      });
      break;
  }

  return (
    <Box
      onClick={handleRowClick}
      onMouseEnter={handleRowEnter}
      onMouseLeave={handleRowLeave}
      style={{
        display: "grid",
        // Fixed label + fixed trailing columns keep every (independent) row
        // grid aligned: the label column, the `1fr` status/source column, and
        // the trailing action column all start/end at the same x down the
        // panel. The trailing `⋯` slot is a fixed width that is always
        // reserved, so rows with and without a menu still line up. The label
        // column is sized to hold the common demo labels (e.g. "Prepared file
        // data", ~107px at the panel's xs font) without truncating; genuinely
        // long labels still ellipsize with a `title` fallback.
        gridTemplateColumns: "124px minmax(0, 1fr) auto",
        alignItems: "center",
        columnGap: 8,
        ...(interactive ? { cursor: "pointer" } : {}),
      }}
      data-testid={interactive ? `input-producer-row-${portName}` : undefined}
      data-interactive={interactive ? "true" : undefined}
    >
      <Text size="xs" fw={500} truncate title={portLabel}>
        {portLabel}
      </Text>
      <Box style={{ minWidth: 0 }}>{middle}</Box>
      {/* Trailing action cell. `stop` keeps in-cell clicks (primary button +
          the ⋯ menu trigger) from bubbling up to fire the row-level jump; the
          real controls inside carry their own keyboard handling, so this
          wrapper is just a click-propagation guard. */}
      <Box
        onClick={stop}
        data-testid={`input-row-actions-${portName}`}
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 6,
        }}
      >
        {primary}
        {/* Reserve the trailing `⋯` column at a fixed width on every row so
            menu / no-menu rows still align. */}
        <Box style={{ width: 28, display: "flex", justifyContent: "flex-end" }}>
          {menuActions.length > 0 && (
            <Menu position="bottom-end" withArrow shadow="md">
              <Menu.Target>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  aria-label="More actions"
                  data-testid={`input-row-menu-${portName}`}
                >
                  <IconDots size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {menuActions.map((action) => (
                  <Menu.Item
                    key={action.key}
                    onClick={action.onClick}
                    data-testid={`input-row-menu-${portName}-${action.key}`}
                  >
                    {action.label}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          )}
        </Box>
      </Box>
    </Box>
  );
}
