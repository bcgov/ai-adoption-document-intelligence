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
 */

import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Divider,
  Drawer,
  Group,
  Select,
  Stack,
  TagsInput,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type {
  CtxDeclaration,
  GraphWorkflowConfig,
  KindRef,
} from "../../../types/workflow";
import { KindSelect } from "./KindSelect";

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
}

export function WorkflowSettingsDrawer({
  opened,
  onClose,
  config,
  onConfigChange,
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
    // Rebuild ctx preserving insertion order
    const nextCtx: Record<string, CtxDeclaration> = {};
    for (const [k, v] of Object.entries(config.ctx)) {
      nextCtx[k === oldKey ? newKey : k] = v;
    }
    // Rewrite any binding pointing at oldKey
    const nextNodes = { ...config.nodes };
    for (const [id, node] of Object.entries(config.nodes)) {
      const inputs = node.inputs?.map((b) =>
        b.ctxKey === oldKey ? { ...b, ctxKey: newKey } : b,
      );
      const outputs = node.outputs?.map((b) =>
        b.ctxKey === oldKey ? { ...b, ctxKey: newKey } : b,
      );
      nextNodes[id] = { ...node, inputs, outputs };
    }
    onConfigChange({ ...config, ctx: nextCtx, nodes: nextNodes });
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
      size={420}
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
            binding that references it.
          </Text>
          <CtxDeclarationsEditor
            ctx={config.ctx}
            onUpdate={setCtx}
            onRename={renameCtxKey}
          />
        </Box>
      </Stack>
    </Drawer>
  );
}

interface CtxDeclarationsEditorProps {
  ctx: Record<string, CtxDeclaration>;
  onUpdate: (next: Record<string, CtxDeclaration>) => void;
  onRename: (oldKey: string, newKey: string) => void;
}

function CtxDeclarationsEditor({
  ctx,
  onUpdate,
  onRename,
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
          ctxKey={key}
          declaration={decl}
          onRename={(next) => onRename(key, next)}
          onUpdate={(next) => updateDeclaration(key, next)}
          onDelete={() => deleteKey(key)}
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
  ctxKey: string;
  declaration: CtxDeclaration;
  onRename: (next: string) => void;
  onUpdate: (next: CtxDeclaration) => void;
  onDelete: () => void;
}

function CtxRow({
  ctxKey,
  declaration,
  onRename,
  onUpdate,
  onDelete,
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
