/**
 * Workflow-level settings drawer.
 *
 * Surfaces metadata (description, version, tags), the entry node selection,
 * and the editable list of `ctx` declarations. The NAME stays in the top bar,
 * as the editor's click-to-edit title; the description moved here in R-2
 * (2026-08-03) because a single top-bar line truncated it mid-word.
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
  Textarea,
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
import {
  formatCtxDefaultValue,
  parseCtxDefaultValue,
} from "./ctx-default-value";
import {
  describeKindMismatch,
  findKindMismatchedConsumers,
} from "./ctx-kind-consumers";
import { ctxRunContract, describeRunContract } from "./ctx-run-contract";
import { KindSelect } from "./KindSelect";
import { isConstCtxKey } from "./port-constants";
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

  // P-5 — the hidden declarations backing port constants are ctx entries like
  // any other, but they are not NAMED values that flow between nodes: they are
  // one value typed onto one port, edited on the row that owns it. Counting or
  // listing them here would turn every typed constant into a `__const_*` line
  // in the workflow's vocabulary. Promotion is the door between the two lists.
  const namedCtxKeyCount = Object.keys(config.ctx).filter(
    (key) => !isConstCtxKey(key),
  ).length;

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
            {/*
              R-2 (2026-08-03) — description moved here from the top bar. It
              was a single-line TextInput capped at 280px there, so it
              truncated mid-word while you were editing it; a workflow's
              description is prose and needs room to wrap. The name stayed
              behind as the editor's click-to-edit title.
            */}
            <Textarea
              label="Description"
              placeholder="What this workflow does, and when to run it."
              size="xs"
              autosize
              minRows={2}
              maxRows={6}
              value={config.metadata.description ?? ""}
              onChange={(e) =>
                setMetadata({
                  description: e.currentTarget.value || undefined,
                })
              }
              data-testid="workflow-settings-description"
            />
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
              {namedCtxKeyCount}
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
  // Hidden port constants are filtered out of the LIST but stay in the
  // collision set below: an author cannot see a `__const_*` key here, so a
  // rename that landed on one would merge two declarations with nothing on
  // screen explaining why.
  const rows = Object.entries(ctx).filter(([key]) => !isConstCtxKey(key));
  const allKeys = Object.keys(ctx);

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
          takenNames={new Set(allKeys.filter((k) => k !== key))}
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
  /** Every OTHER declared key — a rename onto one of these must be refused. */
  takenNames: ReadonlySet<string>;
}

function CtxRow({
  config,
  ctxKey,
  declaration,
  onRename,
  onUpdate,
  onDelete,
  onSelectNode,
  takenNames,
}: CtxRowProps) {
  // Local name state so typing doesn't fight the parent's rename pipeline
  // (rename only commits on blur; intermediate keystrokes stay local).
  const [localName, setLocalName] = useState(ctxKey);
  useEffect(() => {
    setLocalName(ctxKey);
  }, [ctxKey]);

  /**
   * G-074 — a rename onto a name that is already declared used to be a silent
   * no-op: the drawer refused it and the field snapped back, so the author was
   * left believing the rename had happened. `renameCtxKeyInConfig` merges the
   * two declarations if it is ever called with a colliding key, so the refusal
   * itself is right; what was missing was saying so. The message shows live
   * while the typed name collides, and the typed text is KEPT on blur — the
   * author has to see and resolve the collision rather than have it undone.
   */
  const collides = localName !== ctxKey && takenNames.has(localName);
  const nameError = collides
    ? `“${localName}” is already declared. Pick another name.`
    : undefined;

  const commitRename = () => {
    if (collides) return;
    if (localName === "" || localName === ctxKey) {
      setLocalName(ctxKey);
      return;
    }
    onRename(localName);
  };

  /**
   * G-049 — retyping a kind used to be silent at the point of the edit: the
   * new kind was written straight into the config, and the pinned inputs it
   * had just stopped satisfying were only discoverable by opening every node
   * or reading the validation drawer. Reported as STATE, not as an event, so
   * it also catches a graph that loads already mismatched and clears itself
   * the moment the mismatch is resolved from either end.
   */
  const kindMismatches = useMemo(
    () => findKindMismatchedConsumers(config, ctxKey),
    [config, ctxKey],
  );

  /**
   * G-065 — `Input` is not a display preference: it adds a property to the
   * schema `/run-spec` publishes and `/runs` validates bodies against, and a
   * REQUIRED one unless a default fills the gap. It is also inert when a
   * `source.api` node or the library kind supplies the inputs instead. Say
   * which of those is true, in the caller's terms, on the row itself.
   */
  const runContract = ctxRunContract(config, declaration);
  const runContractCopy = describeRunContract(runContract);

  /**
   * P-5 — the default-value field. This is the surface for a value worth
   * NAMING and sharing: one default, read by every port bound to the key, and
   * (when `Input` is ticked) the reason the caller may omit it. It is
   * deliberately not the way IN — reaching the drawer, adding a declaration
   * and binding a port to it is three surfaces to set one file type. That
   * journey starts on the port row and arrives here through "Make this a
   * workflow input".
   *
   * Local draft + commit-on-blur, same shape as the name field above: the text
   * is only a value once it parses, and a half-typed `{"a":` must not
   * overwrite what is stored on every keystroke.
   */
  const [localDefault, setLocalDefault] = useState(() =>
    formatCtxDefaultValue(declaration.defaultValue, declaration.type),
  );
  const [defaultError, setDefaultError] = useState<string | null>(null);
  useEffect(() => {
    setLocalDefault(
      formatCtxDefaultValue(declaration.defaultValue, declaration.type),
    );
    setDefaultError(null);
  }, [declaration.defaultValue, declaration.type]);

  const commitDefault = () => {
    const parsed = parseCtxDefaultValue(localDefault, declaration.type);
    if (!parsed.ok) {
      setDefaultError(parsed.error);
      return;
    }
    setDefaultError(null);
    if (parsed.value === undefined) {
      // `defaultValue?` is optional, not nullable — strip it rather than
      // storing `undefined`, so a cleared default reads as "no default" in
      // the persisted JSON (mirrors the `kind` / `isInput` strip pattern).
      const { defaultValue: _omitted, ...rest } = declaration;
      onUpdate(rest);
      return;
    }
    onUpdate({ ...declaration, defaultValue: parsed.value });
  };

  return (
    <Stack gap={2}>
      <Group gap={6} wrap="nowrap" align="flex-end">
        <TextInput
          label="Name"
          aria-label={`Name for ${ctxKey}`}
          size="xs"
          value={localName}
          error={nameError}
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
        <TextInput
          label="Default value"
          size="xs"
          placeholder={declaration.type === "string" ? "optional" : "JSON"}
          value={localDefault}
          error={defaultError}
          aria-label={`Default value for ${ctxKey}`}
          data-testid={`ctx-default-${ctxKey}`}
          onChange={(e) => setLocalDefault(e.currentTarget.value)}
          onBlur={commitDefault}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          }}
          style={{ flex: 2, minWidth: 0 }}
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
      {runContractCopy !== null && (
        <Text
          size="10px"
          c={runContract.status === "ignored" ? "dimmed" : "blue"}
          data-testid={`ctx-run-contract-${ctxKey}`}
        >
          {runContractCopy}
        </Text>
      )}
      {kindMismatches.length > 0 && (
        <Group gap={4} wrap="nowrap">
          <Text size="10px" c="red" data-testid={`ctx-kind-impact-${ctxKey}`}>
            {describeKindMismatch(kindMismatches)}:
          </Text>
          {kindMismatches.map((consumer) => (
            <UnstyledButton
              key={`${consumer.nodeId}.${consumer.port}`}
              onClick={() => onSelectNode(consumer.nodeId)}
              aria-label={`Open ${consumer.nodeLabel} — ${consumer.portLabel}`}
            >
              <Text size="10px" c="red" td="underline">
                {consumer.nodeLabel} · {consumer.portLabel}
              </Text>
            </UnstyledButton>
          ))}
        </Group>
      )}
    </Stack>
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
