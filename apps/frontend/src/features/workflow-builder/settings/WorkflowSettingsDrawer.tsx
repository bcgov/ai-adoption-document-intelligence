/**
 * Workflow-level settings drawer.
 *
 * Surfaces metadata (version, tags), the entry node selection, and the
 * editable list of `ctx` declarations. Name + description stay in the
 * top bar — the drawer covers the previously-implicit fields.
 *
 * Ctx-rename behavior: when a ctx key is renamed in this drawer, any
 * PortBinding (input or output) in the graph whose `ctxKey` matches the
 * old name is rewritten to the new name in the same atomic update. This
 * stops a rename from silently breaking bindings.
 *
 * G-009: each row also shows its BLAST RADIUS — what reads the variable and
 * what writes it — because rename and delete are both destructive and an
 * author could previously only discover the damage afterwards, by opening
 * every node in turn.
 */

import { findCtxKeyReferences } from "@ai-di/graph-workflow";
import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Divider,
  Drawer,
  Group,
  Popover,
  ScrollArea,
  Select,
  Stack,
  TagsInput,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconArrowRight, IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import type {
  CtxDeclaration,
  GraphWorkflowConfig,
  KindRef,
} from "../../../types/workflow";
import { KindSelect } from "./KindSelect";
import { renameCtxKeyInConfig } from "./rename-ctx-key";

const CTX_TYPES: CtxDeclaration["type"][] = [
  "string",
  "number",
  "boolean",
  "object",
  "array",
];

interface WorkflowSettingsDrawerProps {
  opened: boolean;
  onClose: () => void;
  config: GraphWorkflowConfig;
  onConfigChange: (next: GraphWorkflowConfig) => void;
  /**
   * G-009 — take the author to a node that references a ctx key. The page
   * routes this through its one select-and-reveal helper; the drawer only
   * names the node (and closes itself, since it covers the canvas).
   */
  onSelectNode: (nodeId: string) => void;
}

export function WorkflowSettingsDrawer({
  opened,
  onClose,
  config,
  onConfigChange,
  onSelectNode,
}: WorkflowSettingsDrawerProps) {
  const setMetadata = (patch: Partial<GraphWorkflowConfig["metadata"]>) =>
    onConfigChange({
      ...config,
      metadata: { ...config.metadata, ...patch },
    });

  const setEntryNode = (id: string | null) =>
    onConfigChange({ ...config, entryNodeId: id ?? "" });

  const setCtx = (ctx: Record<string, CtxDeclaration>) =>
    onConfigChange({ ...config, ctx });

  const renameCtxKey = (oldKey: string, newKey: string) => {
    if (oldKey === newKey || newKey === "" || config.ctx[newKey]) return;
    // §4.8: rewrite EVERY reference to the key — not just node inputs/outputs
    // but also map/join ctx keys, childWorkflow mappings, and ValueRef refs
    // inside switch/pollUntil conditions. See rename-ctx-key.ts.
    onConfigChange(renameCtxKeyInConfig(config, oldKey, newKey));
  };

  const nodeOptions = Object.entries(config.nodes).map(([id, n]) => ({
    value: id,
    label: `${n.label} (${id})`,
  }));

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      // Wide + responsive so the multi-column Context declarations table
      // (Name / Type / Description / Kind / Input) has room to render legibly;
      // clamps to the viewport on narrow screens.
      size="clamp(480px, 60vw, 900px)"
      title="Workflow settings"
      overlayProps={{ opacity: 0.3 }}
      withinPortal
    >
      <Stack gap="md">
        <Box>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={4}>
            Metadata
          </Text>
          <Stack gap="xs">
            <TextInput
              label="Version"
              placeholder="1.0.0"
              size="xs"
              value={config.metadata.version ?? ""}
              onChange={(e) =>
                setMetadata({ version: e.currentTarget.value || undefined })
              }
            />
            <TagsInput
              label="Tags"
              description="Press Enter to add. Used for filtering on the workflows list."
              size="xs"
              value={config.metadata.tags ?? []}
              onChange={(tags) =>
                setMetadata({ tags: tags.length > 0 ? tags : undefined })
              }
              clearable
            />
          </Stack>
        </Box>

        <Divider />

        <Select
          label="Entry node"
          placeholder={
            nodeOptions.length === 0
              ? "Add a node first"
              : "Pick the starting node"
          }
          description="The first node executed when the workflow runs."
          size="xs"
          data={nodeOptions}
          value={config.entryNodeId || null}
          onChange={setEntryNode}
          disabled={nodeOptions.length === 0}
          clearable={false}
        />

        <Divider />

        <Box>
          <Group justify="space-between" mb={4}>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase">
              Context declarations
            </Text>
            <Text size="10px" c="dimmed">
              {Object.keys(config.ctx).length}
            </Text>
          </Group>
          <Text size="10px" c="dimmed" mb="xs">
            Named values that flow between nodes. Renaming a key rewrites every
            binding that references it — open “Used by” to see what that is
            before you change or remove one.
          </Text>
          <CtxDeclarationsEditor
            config={config}
            ctx={config.ctx}
            onUpdate={setCtx}
            onRename={renameCtxKey}
            onSelectNode={(nodeId) => {
              // The node lives on the canvas this drawer covers.
              onClose();
              onSelectNode(nodeId);
            }}
          />
        </Box>
      </Stack>
    </Drawer>
  );
}

interface CtxDeclarationsEditorProps {
  config: GraphWorkflowConfig;
  ctx: Record<string, CtxDeclaration>;
  onUpdate: (next: Record<string, CtxDeclaration>) => void;
  onRename: (oldKey: string, newKey: string) => void;
  onSelectNode: (nodeId: string) => void;
}

function CtxDeclarationsEditor({
  config,
  ctx,
  onUpdate,
  onRename,
  onSelectNode,
}: CtxDeclarationsEditorProps) {
  const rows = Object.entries(ctx);

  const updateDeclaration = (key: string, decl: CtxDeclaration) => {
    onUpdate({ ...ctx, [key]: decl });
  };

  const deleteKey = (key: string) => {
    const { [key]: _, ...rest } = ctx;
    onUpdate(rest);
  };

  const addRow = () => {
    let suffix = 1;
    let candidate = `newKey${suffix}`;
    while (ctx[candidate]) {
      suffix += 1;
      candidate = `newKey${suffix}`;
    }
    onUpdate({ ...ctx, [candidate]: { type: "string" } });
  };

  return (
    <Stack gap="xs">
      {rows.length === 0 && (
        <Text size="10px" c="dimmed" fs="italic">
          No context declared yet.
        </Text>
      )}
      {rows.map(([key, decl]) => (
        <CtxRow
          key={key}
          config={config}
          ctxKey={key}
          declaration={decl}
          onRename={(next) => onRename(key, next)}
          onUpdate={(next) => updateDeclaration(key, next)}
          onDelete={() => deleteKey(key)}
          onSelectNode={onSelectNode}
        />
      ))}
      <Button
        leftSection={<IconPlus size={12} />}
        size="compact-xs"
        variant="light"
        onClick={addRow}
        style={{ alignSelf: "flex-start" }}
      >
        Add context variable
      </Button>
    </Stack>
  );
}

interface CtxRowProps {
  config: GraphWorkflowConfig;
  ctxKey: string;
  declaration: CtxDeclaration;
  onRename: (next: string) => void;
  onUpdate: (next: CtxDeclaration) => void;
  onDelete: () => void;
  onSelectNode: (nodeId: string) => void;
}

function CtxRow({
  config,
  ctxKey,
  declaration,
  onRename,
  onUpdate,
  onDelete,
  onSelectNode,
}: CtxRowProps) {
  // Local name state so typing doesn't fight the parent's rename pipeline
  // (rename only commits on blur; intermediate keystrokes stay local).
  const [localName, setLocalName] = useState(ctxKey);
  useEffect(() => {
    setLocalName(ctxKey);
  }, [ctxKey]);

  const commitRename = () => {
    if (localName === "" || localName === ctxKey) {
      setLocalName(ctxKey);
      return;
    }
    onRename(localName);
  };

  return (
    <Group gap={6} wrap="nowrap" align="flex-end">
      <TextInput
        label="Name"
        size="xs"
        value={localName}
        onChange={(e) => setLocalName(e.currentTarget.value)}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        }}
        style={{ flex: 2, minWidth: 0 }}
      />
      <Select
        label="Type"
        size="xs"
        data={CTX_TYPES}
        value={declaration.type}
        onChange={(v) => {
          if (v)
            onUpdate({ ...declaration, type: v as CtxDeclaration["type"] });
        }}
        style={{ flex: 1, minWidth: 80 }}
        allowDeselect={false}
      />
      <TextInput
        label="Description"
        size="xs"
        placeholder="optional"
        value={declaration.description ?? ""}
        onChange={(e) =>
          onUpdate({
            ...declaration,
            description: e.currentTarget.value || undefined,
          })
        }
        style={{ flex: 3, minWidth: 0 }}
      />
      <KindSelect
        label="Kind"
        size="xs"
        placeholder="—"
        value={declaration.kind}
        onChange={(next: KindRef | undefined) => {
          // Strip the `kind` property entirely when wildcard is picked —
          // `kind?` is optional, not nullable (TYPED_IO_DESIGN.md §5.1).
          // Mirrors the `isInput` strip-on-false pattern.
          if (next === undefined) {
            const { kind: _omitted, ...rest } = declaration;
            onUpdate(rest);
          } else {
            onUpdate({ ...declaration, kind: next });
          }
        }}
        style={{ flex: 2, minWidth: 120 }}
        aria-label={`Kind for ${ctxKey}`}
      />
      <CtxReferencesPopover
        config={config}
        ctxKey={ctxKey}
        onSelectNode={onSelectNode}
      />
      <Tooltip
        label="Mark this ctx entry as a caller-supplied input. Surfaced in the workflow's Run panel and the /run-spec endpoint."
        multiline
        w={260}
        withArrow
        position="top"
      >
        <Checkbox
          label="Input"
          size="xs"
          checked={declaration.isInput === true}
          onChange={(e) =>
            onUpdate({
              ...declaration,
              isInput: e.currentTarget.checked ? true : undefined,
            })
          }
          mb={4}
          aria-label={`Mark ${ctxKey} as caller-supplied input`}
        />
      </Tooltip>
      <ActionIcon
        variant="subtle"
        color="red"
        onClick={onDelete}
        aria-label={`Remove ${ctxKey}`}
        mb={4}
      >
        <IconTrash size={14} />
      </ActionIcon>
    </Group>
  );
}

/**
 * G-009 — the blast radius of one ctx variable, on the row that owns it.
 *
 * "What else reads this before I change it?" was previously answerable only
 * by opening every node in turn (the settings panel shows a node's inbound
 * sources; nothing listed consumers). `findCtxKeyReferences` answers both
 * halves from the shared enumeration in `@ai-di/graph-workflow` — the same
 * data the auto-wire resolver and the rename sweep use, so this can never
 * disagree with what a rename would actually rewrite.
 */
function CtxReferencesPopover({
  config,
  ctxKey,
  onSelectNode,
}: {
  config: GraphWorkflowConfig;
  ctxKey: string;
  onSelectNode: (nodeId: string) => void;
}) {
  const [opened, setOpened] = useState(false);
  const refs = useMemo(
    () => findCtxKeyReferences(config, ctxKey),
    [config, ctxKey],
  );

  const label = (nodeId: string) => config.nodes[nodeId]?.label || nodeId;
  const pick = (nodeId: string) => {
    setOpened(false);
    onSelectNode(nodeId);
  };

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      shadow="md"
      width={280}
      withinPortal
      transitionProps={{ duration: 0 }}
    >
      <Popover.Target>
        <Button
          size="compact-xs"
          variant={refs.total > 0 ? "light" : "subtle"}
          color={refs.total > 0 ? "blue" : "gray"}
          onClick={() => setOpened((o) => !o)}
          data-testid={`ctx-references-${ctxKey}`}
          aria-label={`References to ${ctxKey}`}
          mb={4}
          style={{ flexShrink: 0 }}
        >
          Used by {refs.total}
        </Button>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        {refs.total === 0 ? (
          <Text
            size="xs"
            c="dimmed"
            data-testid={`ctx-references-empty-${ctxKey}`}
          >
            Nothing in this workflow reads or writes{" "}
            <Text span fw={600}>
              {ctxKey}
            </Text>
            {refs.declared
              ? " — it is declared but unused."
              : " — it is not even declared."}
          </Text>
        ) : (
          <ScrollArea.Autosize mah={260} type="auto">
            <Stack gap={8}>
              {refs.writers.length > 0 && (
                <Box data-testid={`ctx-writers-${ctxKey}`}>
                  <Text size="10px" fw={600} c="dimmed" tt="uppercase" mb={2}>
                    Written by ({refs.writers.length})
                  </Text>
                  <Stack gap={2}>
                    {refs.writers.map((writer) => (
                      <ReferenceRow
                        key={`w-${writer.nodeId}-${writer.port}`}
                        testId={`ctx-reference-${ctxKey}-${writer.nodeId}`}
                        label={label(writer.nodeId)}
                        detail={`${writer.nodeId} · ${writer.port} → ${writer.ctxKey}`}
                        onClick={() => pick(writer.nodeId)}
                      />
                    ))}
                  </Stack>
                </Box>
              )}
              {refs.readers.length > 0 && (
                <Box data-testid={`ctx-readers-${ctxKey}`}>
                  <Text size="10px" fw={600} c="dimmed" tt="uppercase" mb={2}>
                    Read by ({refs.readers.length})
                  </Text>
                  <Stack gap={2}>
                    {refs.readers.map((reader) => (
                      <ReferenceRow
                        key={`r-${reader.nodeId}-${reader.via}-${reader.port}`}
                        testId={`ctx-reference-${ctxKey}-${reader.nodeId}`}
                        label={label(reader.nodeId)}
                        detail={`${reader.nodeId} · ${reader.port} ← ${reader.ref}`}
                        onClick={() => pick(reader.nodeId)}
                      />
                    ))}
                  </Stack>
                </Box>
              )}
            </Stack>
          </ScrollArea.Autosize>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}

function ReferenceRow({
  testId,
  label,
  detail,
  onClick,
}: {
  testId: string;
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <UnstyledButton
      onClick={onClick}
      data-testid={testId}
      px={6}
      py={3}
      style={{ borderRadius: 4 }}
    >
      <Group gap={4} wrap="nowrap">
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text size="xs" fw={600} lineClamp={1}>
            {label}
          </Text>
          <Text size="10px" c="dimmed" lineClamp={1}>
            {detail}
          </Text>
        </Box>
        <IconArrowRight size={12} />
      </Group>
    </UnstyledButton>
  );
}
