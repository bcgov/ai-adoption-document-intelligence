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
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconChevronDown,
  IconChevronRight,
  IconDots,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import {
  ensureEdgeBetween,
  pinPortBinding,
  revertPortToAutomatic,
} from "../canvas/wire-mutations";
import {
  ProducerPicker,
  type ProducerSelection,
} from "../graph-widgets/ProducerPicker";
import {
  decodeAutoProducerNodeId,
  type PinnedSource,
  type RowResolution,
  resolvePinnedSource,
  resolveWireableInputRows,
  type WireableInputRow,
} from "./input-row-resolution";
import {
  clearPortConstant,
  getPortConstant,
  isPromotableCtxKeyName,
  promotePortConstant,
  setPortConstant,
} from "./port-constants";

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
  // P-5 — the optional-inputs disclosure is COLLAPSED on arrival: the panel
  // stays as short as it was before optional identifier ports were surfaced,
  // and the ports the canvas already advertises stop being unreachable.
  const [optionalOpen, setOptionalOpen] = useState(false);
  // The port whose constant is being promoted to a named workflow input, plus
  // the name being typed for it. Held here rather than on the row so the modal
  // survives the row moving between the two lists.
  const [promoteOf, setPromoteOf] = useState<string | null>(null);
  const [promoteName, setPromoteName] = useState("");

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
  if (!node) return null;
  // G-013: a map's `collection` is a real bindable input and gets a row here
  // like any other port — read-only, because its key lives in
  // `collectionCtxKey` (edited in MapNodeSettings) rather than `inputs[]`,
  // which is what the pin/revert mutations write.
  const isMapCollection = node.type === "map";
  if (!isMapCollection) {
    if (node.type !== "activity" && node.type !== "pollUntil") return null;
    if (!getActivityCatalogEntry(node.activityType)) return null;
  }

  // Every port the catalog declares with a kind gets a row here — this is the
  // one surface that can accept an answer, so it opts into the optional
  // identifier ports the node card already advertises (P-5). They come back
  // flagged `optional` and go behind the disclosure below; everything that
  // holds a wire, a pin or a constant stays in the main list.
  const allRows = resolveWireableInputRows(config, nodeId, {
    includeOptionalIdentifierPorts: true,
  });
  const rows = allRows.filter((row) => !row.optional);
  const optionalRows = allRows.filter((row) => row.optional);
  const activePickerPortLabel =
    activePickerPort != null
      ? (allRows.find((r) => r.port.name === activePickerPort)?.port.label ??
        activePickerPort)
      : null;

  const handleOverride = (portName: string, selection: ProducerSelection) => {
    // UX walkthrough 2026-07-29 — picking an on-canvas-but-unconnected
    // producer also draws the execution edge, so the pick is complete on its
    // own instead of demanding the user knew to connect first.
    const base = selection.needsEdge
      ? ensureEdgeBetween(config, selection.producerNodeId, nodeId)
      : config;
    const next = pinPortBinding(base, nodeId, portName, selection);
    if (next !== config) onConfigChange(next);
    closePicker();
  };

  const handleRevert = (portName: string) => {
    onConfigChange(revertPortToAutomatic(config, nodeId, portName));
  };

  // P-5 — a typed value becomes a hidden ctx declaration carrying
  // `defaultValue`, with the port pinned to it (see port-constants.ts). Both
  // mutations return the same config reference when nothing changed, so a
  // blur that commits an unchanged value records no undo step.
  const handleConstantCommit = (portName: string, value: string) => {
    const next = setPortConstant(config, nodeId, portName, value);
    if (next !== config) onConfigChange(next);
  };

  const handleConstantClear = (portName: string) => {
    const next = clearPortConstant(config, nodeId, portName);
    if (next !== config) onConfigChange(next);
  };

  const openPromote = (portName: string) => {
    setPromoteOf(portName);
    // The port name is the obvious first suggestion; the author edits it when
    // it collides or when the workflow wants a friendlier caller-facing name.
    setPromoteName(isPromotableCtxKeyName(portName) ? portName : "");
  };

  const promoteError =
    promoteName === ""
      ? null
      : !isPromotableCtxKeyName(promoteName)
        ? "Use letters, numbers and underscores, starting with a letter."
        : config.ctx[promoteName] !== undefined
          ? `“${promoteName}” is already declared. Pick another name.`
          : null;

  const commitPromote = () => {
    if (promoteOf === null || promoteName === "" || promoteError !== null) {
      return;
    }
    const next = promotePortConstant(config, nodeId, promoteOf, promoteName);
    if (next !== config) onConfigChange(next);
    setPromoteOf(null);
  };

  const renderRow = (row: WireableInputRow) => {
    const { port, resolution } = row;
    return (
      <PortRow
        key={port.name}
        portName={port.name}
        portLabel={port.label}
        portDescription={port.description}
        optional={row.optional}
        resolution={resolution}
        constantValue={getPortConstant(config, nodeId, port.name)}
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
        showActions={!isMapCollection}
        onOverride={() => setOverrideOf(port.name)}
        onRevert={() => handleRevert(port.name)}
        onConstantCommit={(value) => handleConstantCommit(port.name, value)}
        onConstantClear={() => handleConstantClear(port.name)}
        onPromote={() => openPromote(port.name)}
      />
    );
  };

  return (
    <Stack gap={4} data-testid="inputs-section">
      <Text size="xs" fw={600}>
        Inputs
      </Text>
      {allRows.length === 0 && (
        <Text size="10px" c="dimmed">
          None.
        </Text>
      )}
      {rows.map(renderRow)}

      {optionalRows.length > 0 && (
        <Box>
          <UnstyledButton
            onClick={() => setOptionalOpen((open) => !open)}
            data-testid="optional-inputs-toggle"
            aria-expanded={optionalOpen}
          >
            <Group gap={4} wrap="nowrap">
              {optionalOpen ? (
                <IconChevronDown size={12} />
              ) : (
                <IconChevronRight size={12} />
              )}
              <Text size="10px" c="dimmed">
                {optionalRows.length} optional input
                {optionalRows.length === 1 ? "" : "s"}
              </Text>
            </Group>
          </UnstyledButton>
          {optionalOpen && (
            <Stack gap={4} mt={4} data-testid="optional-inputs-list">
              {optionalRows.map(renderRow)}
            </Stack>
          )}
        </Box>
      )}

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
              (allRows.find((r) => r.port.name === activePickerPort)?.port
                .kind ?? "Artifact") as KindRef
            }
            value=""
            onChange={(selection) => {
              if (selection) handleOverride(activePickerPort, selection);
            }}
          />
        )}
      </Modal>

      {/* P-5 step 3 — promotion. The constant already IS a ctx declaration;
          naming it is a rename plus `isInput`, after which it shows up in the
          Run drawer and in the derived run-spec, with the typed value as its
          default. Asking for the name is the whole interaction. */}
      <Modal
        opened={promoteOf !== null}
        onClose={() => setPromoteOf(null)}
        title="Make this a workflow input"
        size="sm"
        transitionProps={{ duration: 0 }}
      >
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            The value you typed stays as the default. Callers can override it
            per run, and it appears in the Run panel under this name.
          </Text>
          <TextInput
            label="Input name"
            size="xs"
            value={promoteName}
            error={promoteError}
            data-testid="promote-constant-name"
            onChange={(e) => setPromoteName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitPromote();
            }}
          />
          <Group justify="flex-end" gap="xs">
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={() => setPromoteOf(null)}
            >
              Cancel
            </Button>
            <Button
              size="compact-xs"
              data-testid="promote-constant-confirm"
              disabled={promoteName === "" || promoteError !== null}
              onClick={commitPromote}
            >
              Make it an input
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

interface PortRowProps {
  portName: string;
  portLabel: string;
  /**
   * The catalog description, used as the constant field's placeholder — it is
   * the port's own account of what happens when nothing is supplied
   * ("Auto-detected from the extension if omitted").
   */
  portDescription?: string;
  /** Folded behind the "N optional inputs" disclosure (P-5). */
  optional: boolean;
  resolution: RowResolution;
  /** The constant typed onto this port, or null when it holds none. */
  constantValue: string | null;
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
  /**
   * Whether the row offers the pin/revert controls. False for rows whose
   * binding is not stored in `inputs[]` (the map's `collection`, G-013) —
   * those are status-only here and edited in their own settings section.
   */
  showActions?: boolean;
  onOverride: () => void;
  onRevert: () => void;
  /** Commit a typed constant (blur / Enter). Empty text clears instead. */
  onConstantCommit: (value: string) => void;
  onConstantClear: () => void;
  onPromote: () => void;
}

function PortRow({
  portName,
  portLabel,
  portDescription,
  optional,
  resolution,
  constantValue,
  producerLabel,
  pinnedSource,
  producerNodeId,
  onJumpToProducer,
  onHoverProducer,
  showActions = true,
  onOverride,
  onRevert,
  onConstantCommit,
  onConstantClear,
  onPromote,
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
  // Status badge lives in its OWN fixed-width grid column (not trailing the
  // variable-width source text) so every row's badge lines up vertically.
  let badge: React.ReactNode = null;
  let middle: React.ReactNode = null;
  let primary: React.ReactNode = null;
  const menuActions: { key: string; label: string; onClick: () => void }[] = [];

  switch (resolution.status) {
    case "auto-bound":
      badge = (
        <Tooltip label="Connected automatically">
          <Badge size="xs" color="green" variant="light">
            Auto
          </Badge>
        </Tooltip>
      );
      middle = (
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <Text size="xs">←</Text>
          <Text size="xs" truncate title={producerLabel ?? undefined}>
            {producerLabel}
          </Text>
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
      badge = (
        <Tooltip label="Pinned by you">
          <Badge size="xs" color="gray" variant="light">
            Pinned
          </Badge>
        </Tooltip>
      );
      middle = (
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          {pinnedSource?.via === "ctx" ? (
            <Text size="xs" truncate title={`from ${pinnedSource.ctxKey}`}>
              from {pinnedSource.ctxKey}
            </Text>
          ) : pinnedSource?.via === "constant" ? (
            // A typed-in value reads back as itself. Its synthesised ctx key
            // is hidden from every other surface, so naming it here would be
            // the only place the author meets plumbing they never chose (P-5).
            <Text
              size="xs"
              truncate
              title={`fixed value: ${pinnedSource.value}`}
            >
              = {pinnedSource.value || "(empty)"}
            </Text>
          ) : (
            <>
              <Text size="xs">←</Text>
              <Text
                size="xs"
                truncate
                title={
                  pinnedSource?.via === "producer"
                    ? pinnedSource.label
                    : resolution.ctxKey
                }
              >
                {pinnedSource?.via === "producer"
                  ? pinnedSource.label
                  : resolution.ctxKey}
              </Text>
            </>
          )}
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
    case "locked-dangling":
      // G-005: pinned, but the key it points at no longer has a source.
      badge = (
        <Tooltip label="This source no longer exists">
          <Badge size="xs" color="red" variant="light">
            Broken
          </Badge>
        </Tooltip>
      );
      middle = (
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <Text size="xs" c="red" truncate title={`from ${resolution.ctxKey}`}>
            from {resolution.ctxKey} — nothing writes this
          </Text>
        </Group>
      );
      primary = (
        <Button
          size="compact-xs"
          color="red"
          variant="light"
          onClick={onOverride}
        >
          Pick a source
        </Button>
      );
      menuActions.push({
        key: "revert",
        label: "Revert to automatic",
        onClick: onRevert,
      });
      break;
    case "locked-kind-mismatch":
      // G-005: pinned to a real source whose kind can't satisfy this port.
      badge = (
        <Tooltip
          label={`Expected ${resolution.expected}, found ${resolution.actual}`}
        >
          <Badge size="xs" color="red" variant="light">
            Wrong type
          </Badge>
        </Tooltip>
      );
      middle = (
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <Text size="xs" c="red" truncate title={`from ${resolution.ctxKey}`}>
            from {resolution.ctxKey} — {resolution.actual}, not{" "}
            {resolution.expected}
          </Text>
        </Group>
      );
      primary = (
        <Button
          size="compact-xs"
          color="red"
          variant="light"
          onClick={onOverride}
        >
          Pick a source
        </Button>
      );
      menuActions.push({
        key: "revert",
        label: "Revert to automatic",
        onClick: onRevert,
      });
      break;
    case "locked-unbound":
      badge = (
        <Tooltip label="Disconnected by you">
          <Badge size="xs" color="gray" variant="light">
            Disconnected
          </Badge>
        </Tooltip>
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

  // P-5 — a row holding a CONSTANT resolves "locked" like any pinned row, and
  // the generic pinned treatment would render it as `from __const_prep_fileType`
  // with a "Revert to automatic" action that drops the lock and strands the
  // binding. A constant is not a source you navigate to; it is a value you
  // typed, shown in the field below. So the row says so, and its actions are
  // the two things you can do to a value: name it, or remove it.
  if (constantValue !== null) {
    badge = (
      <Tooltip label="A value you typed here">
        <Badge size="xs" color="blue" variant="light">
          Value
        </Badge>
      </Tooltip>
    );
    middle = null;
    primary = null;
    menuActions.length = 0;
    menuActions.push({
      key: "promote",
      label: "Make this a workflow input",
      onClick: onPromote,
    });
    menuActions.push({
      key: "clear",
      label: "Remove value",
      onClick: onConstantClear,
    });
  } else if (optional && resolution.status === "unsatisfied") {
    // An optional identifier port with nothing bound is not a problem: the
    // activity derives it, and the node badge and validation drawer both
    // decline to count it (`computeNodeInputIssues` skips optional identifier
    // ports). A red "Needs a source" here would be this panel inventing a
    // problem no other surface agrees exists.
    primary = null;
  }

  // Status-only rows keep their badge and source text but drop every control
  // that would write `inputs[]` (see `showActions`).
  if (!showActions) {
    primary = null;
    menuActions.length = 0;
  }

  // The value field appears wherever nothing is feeding the port — so typing
  // is an available answer at exactly the moments the panel would otherwise
  // only be able to say "needs a source" — and on a row that already holds a
  // constant, where it is how the value is read and changed. A BROKEN pin
  // (`locked-dangling` / `locked-kind-mismatch`) is deliberately excluded: the
  // author asked for a binding there, and repairing it is the story that row
  // is telling.
  const showConstantField =
    showActions &&
    (constantValue !== null ||
      resolution.status === "unsatisfied" ||
      resolution.status === "ambiguous" ||
      resolution.status === "locked-unbound");

  const row = (
    <Box
      onClick={handleRowClick}
      onMouseEnter={handleRowEnter}
      onMouseLeave={handleRowLeave}
      style={{
        display: "grid",
        // Fixed label + fixed trailing columns keep every (independent) row
        // grid aligned: the label column, the `1fr` source/status column, and
        // the trailing action column all start/end at the same x down the
        // panel. Inside the `1fr` column the source text is left-aligned
        // (truncating if long) and the status BADGE is pushed to the right
        // edge, so Auto / Pinned / Disconnected badges line up vertically as
        // a right-hand status column regardless of the source text's width —
        // without stealing a whole fixed column from the (already narrow)
        // source text. The trailing `⋯` slot is a fixed width so menu /
        // no-menu rows line up. Long labels/sources ellipsize with a `title`.
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
      {/* Source/detail (left, truncates) + status badge pushed to the right
          edge so badges align down the panel as a status column. */}
      <Box
        style={{
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Box style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>{middle}</Box>
        {badge}
      </Box>
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

  if (!showConstantField) return row;

  /**
   * D-2 — a row that can hold a typed value is a LABELLED FIELD, not a row
   * with something tacked underneath.
   *
   * It used to put the input on a second grid line indented into the middle
   * column, which capped it at the source column's width: measured on a fresh
   * `file.prepare`, a 327px panel gave a 159px field starting at x=132, under
   * half the space available and never beside its own label. Committing the
   * value moved the row up into the required list and changed none of that.
   *
   * So the field spans the full width instead, and the two lines are bonded
   * into one visual unit by a tinted, indented block — label and control read
   * as belonging together without a second label repeating the port name. The
   * port's description moves out of the placeholder (where it was always
   * truncated — `` `pdf` or `image`. Auto-det… ``) into helper text under the
   * field, where it can wrap.
   */
  return (
    <Stack gap={4} data-testid={`input-field-block-${portName}`}>
      {row}
      <Box
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 3,
          // Indented and ruled off so the field is visibly subordinate to the
          // row above it — the cue that says "this belongs to that label".
          marginLeft: 8,
          paddingLeft: 8,
          borderLeft: "2px solid var(--mantine-color-default-border, #373A40)",
        }}
      >
        <ConstantValueField
          portName={portName}
          portLabel={portLabel}
          value={constantValue}
          onCommit={onConstantCommit}
          onClear={onConstantClear}
        />
        {portDescription && (
          <Text
            size="10px"
            c="dimmed"
            style={{ lineHeight: 1.35 }}
            data-testid={`input-constant-help-${portName}`}
          >
            {portDescription}
          </Text>
        )}
      </Box>
    </Stack>
  );
}

interface ConstantValueFieldProps {
  portName: string;
  portLabel: string;
  value: string | null;
  onCommit: (value: string) => void;
  onClear: () => void;
}

/**
 * The inline value field (P-5 step 2).
 *
 * Edits are held locally and committed on BLUR (or Enter), never per
 * keystroke, for two reasons: every commit is an `onConfigChange` and so an
 * undo step, and a committed value moves the row out of the optional
 * disclosure into the main list — which remounts this field, and would take
 * the caret with it mid-word.
 *
 * D-2 — the placeholder is a short, generic prompt. It used to be the port's
 * own description, which is a sentence and was therefore always truncated to
 * something like `` `pdf` or `image`. Auto-det… ``; that text is now helper
 * text under the field, where it can wrap and be read.
 */
function ConstantValueField({
  portName,
  portLabel,
  value,
  onCommit,
  onClear,
}: ConstantValueFieldProps) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const commit = () => {
    const current = value ?? "";
    if (draft === current) return;
    if (draft.trim() === "") {
      if (value !== null) onClear();
      return;
    }
    onCommit(draft);
  };

  return (
    <TextInput
      size="xs"
      placeholder="Type a value"
      value={draft}
      style={{ width: "100%" }}
      aria-label={`Value for ${portLabel}`}
      data-testid={`input-constant-${portName}`}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
      }}
    />
  );
}
