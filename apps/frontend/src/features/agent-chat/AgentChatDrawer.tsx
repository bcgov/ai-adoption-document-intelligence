import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAssistantRuntime,
} from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import {
  ActionIcon,
  Badge,
  Box,
  Drawer,
  Group,
  ScrollArea,
  Select,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconChevronDown,
  IconChevronUp,
  IconCircleX,
  IconPaperclip,
  IconPlayerStop,
  IconRefresh,
  IconSend2,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useGroup } from "../../auth/GroupContext";
import { ConversationSwitcher } from "./ConversationSwitcher";
import { ErrorBodyRenderer } from "./error-renderers";
import {
  AGENT_MODEL_OPTIONS,
  type AgentModelOption,
  useAgentChatStore,
} from "./store";
import { getAgentAuthHeaders } from "./useAgentConversations";
import "./agent-chat.css";

const DRAWER_SIZE = 540;

/**
 * Resolve the currently-displayed workflow id from the route. Phase 7
 * supports `/workflows/create-v2?id=<id>` and `/workflows/:id` patterns.
 */
function useCurrentWorkflowId(): string | null {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const queryId = search.get("id");
  if (queryId !== null && queryId.length > 0) return queryId;
  const match = location.pathname.match(/\/workflows\/([^/?#]+)/);
  if (match && match[1] !== "create-v2" && match[1] !== "new") return match[1];
  return null;
}

export function AgentChatDrawer() {
  const isOpen = useAgentChatStore((s) => s.isOpen);
  const close = useAgentChatStore((s) => s.close);
  const conversationId = useAgentChatStore((s) => s.conversationId);
  const setConversationId = useAgentChatStore((s) => s.setConversationId);
  const selectedModel = useAgentChatStore((s) => s.selectedModel);
  const setSelectedModel = useAgentChatStore((s) => s.setSelectedModel);
  const resetConversation = useAgentChatStore((s) => s.resetConversation);
  const [resetKey, bumpResetKey] = useResetKey();

  const currentWorkflowId = useCurrentWorkflowId();
  const { activeGroup } = useGroup();
  const activeGroupId = activeGroup?.id ?? null;
  const queryClient = useQueryClient();
  const conversationIdRef = useRef<string | null>(conversationId);
  conversationIdRef.current = conversationId;
  const activeGroupIdRef = useRef<string | null>(activeGroupId);
  activeGroupIdRef.current = activeGroupId;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent/chat",
        // Headers must be a function so the CSRF cookie + active group
        // are re-read on every send.
        headers: () => getAgentAuthHeaders(activeGroupIdRef.current),
        body: () => ({
          conversationId: conversationIdRef.current,
          workflowId: currentWorkflowId,
          groupId: activeGroupIdRef.current,
          provider: selectedModel.provider,
          model: selectedModel.model,
        }),
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          const newConvId = res.headers.get("x-conversation-id");
          if (newConvId && newConvId !== conversationIdRef.current) {
            setConversationId(newConvId);
          }
          return res;
        },
      }),
    // We rebuild the transport on resetKey changes (new conversation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resetKey, selectedModel.provider, selectedModel.model, currentWorkflowId],
  );

  const runtime = useChatRuntime({
    transport,
    onFinish: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["dynamic-node-list"] });
      queryClient.invalidateQueries({ queryKey: ["workflow"] });
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });

  return (
    <Drawer
      opened={isOpen}
      onClose={close}
      position="right"
      size={DRAWER_SIZE}
      withCloseButton={false}
      lockScroll={false}
      withOverlay={false}
      transitionProps={{ duration: 180 }}
      styles={{
        body: { padding: 0, height: "100%" },
        content: { height: "100vh" },
      }}
      data-testid="agent-chat-drawer"
    >
      <AssistantRuntimeProvider runtime={runtime}>
        <Stack gap={0} h="100%">
          <ChatHeader
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            onClose={close}
            onReset={() => {
              resetConversation();
              bumpResetKey();
            }}
            onAbort={async () => {
              const cid = conversationIdRef.current;
              if (cid === null) return;
              await fetch(`/api/agent/conversations/${cid}/abort`, {
                method: "POST",
                headers: getAgentAuthHeaders(activeGroupIdRef.current),
              }).catch(() => undefined);
            }}
            workflowId={currentWorkflowId}
          />
          <ConversationSwitcher
            workflowId={currentWorkflowId}
            activeConversationId={conversationId}
            activeGroupId={activeGroupId}
            onSelect={(id) => {
              setConversationId(id);
              bumpResetKey();
            }}
          />
          <MessageList />
          <Composer
            workflowId={currentWorkflowId}
            activeGroupId={activeGroupId}
          />
          <ToolCallNavigator />
        </Stack>
      </AssistantRuntimeProvider>
    </Drawer>
  );
}

function useResetKey() {
  const [counter, dispatch] = useReducer((n: number) => n + 1, 0);
  return [counter, dispatch] as const;
}

function ChatHeader({
  selectedModel,
  setSelectedModel,
  onClose,
  onReset,
  onAbort,
  workflowId,
}: {
  selectedModel: AgentModelOption;
  setSelectedModel: (option: AgentModelOption) => void;
  onClose: () => void;
  onReset: () => void;
  onAbort: () => Promise<void> | void;
  workflowId: string | null;
}) {
  const selectData = useMemo(
    () =>
      AGENT_MODEL_OPTIONS.map((o, i) => ({
        value: String(i),
        label: o.label,
      })),
    [],
  );
  const selectedIndex = AGENT_MODEL_OPTIONS.findIndex(
    (o) =>
      o.provider === selectedModel.provider && o.model === selectedModel.model,
  );
  return (
    <Stack gap={4} p="md" style={{ borderBottom: "1px solid #e9ecef" }}>
      <Group justify="space-between">
        <Group gap="xs">
          <Text fw={700}>Workflow Agent</Text>
          {workflowId !== null ? (
            <Badge color="violet" variant="light" size="sm">
              workflow bound
            </Badge>
          ) : (
            <Badge color="gray" variant="light" size="sm">
              no workflow yet
            </Badge>
          )}
        </Group>
        <Group gap={4}>
          <Tooltip label="Abort current request">
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={() => {
                void onAbort();
              }}
              data-testid="agent-chat-abort"
            >
              <IconPlayerStop size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="New conversation">
            <ActionIcon
              variant="subtle"
              onClick={onReset}
              data-testid="agent-chat-reset"
            >
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Close">
            <ActionIcon
              variant="subtle"
              onClick={onClose}
              data-testid="agent-chat-close"
            >
              <IconCircleX size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <Select
        size="xs"
        data={selectData}
        value={String(selectedIndex === -1 ? 0 : selectedIndex)}
        onChange={(value) => {
          const idx = value === null ? 0 : Number(value);
          if (!Number.isNaN(idx) && AGENT_MODEL_OPTIONS[idx]) {
            setSelectedModel(AGENT_MODEL_OPTIONS[idx]);
          }
        }}
        data-testid="agent-chat-model-picker"
        allowDeselect={false}
      />
    </Stack>
  );
}

function MessageList() {
  return (
    <ScrollArea
      style={{ flex: 1 }}
      type="hover"
      offsetScrollbars
      data-testid="agent-chat-thread"
    >
      <ThreadPrimitive.Viewport autoScroll>
        <ThreadPrimitive.Empty>
          <Box p="xl">
            <Stack gap="xs">
              <Text fw={700}>Welcome.</Text>
              <Text size="sm" c="dimmed">
                Ask the agent to build a workflow. Try:
              </Text>
              <Stack gap={4}>
                <Text size="xs" c="dimmed">
                  • "List the available activities in this group."
                </Text>
                <Text size="xs" c="dimmed">
                  • "Create a new workflow named 'invoice extract' and add a
                  source.upload node."
                </Text>
                <Text size="xs" c="dimmed">
                  • "Show me what library workflows we have."
                </Text>
              </Stack>
            </Stack>
          </Box>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
          }}
        />
      </ThreadPrimitive.Viewport>
    </ScrollArea>
  );
}

function UserMessage() {
  return (
    <Box p="sm" style={{ borderBottom: "1px solid #f1f3f5" }}>
      <Text size="xs" c="violet" fw={700} mb={4}>
        You
      </Text>
      <Box style={{ whiteSpace: "pre-wrap" }}>
        <MessagePrimitive.Parts />
      </Box>
    </Box>
  );
}

function AssistantMessage() {
  return (
    <Box
      p="sm"
      style={{ borderBottom: "1px solid #f1f3f5", background: "#fafafa" }}
    >
      <Text size="xs" c="dimmed" fw={700} mb={4}>
        Agent
      </Text>
      <Box style={{ whiteSpace: "pre-wrap" }}>
        <MessagePrimitive.Parts
          components={{
            tools: {
              Fallback: AgentToolCallCard,
            },
          }}
        />
      </Box>
    </Box>
  );
}

function AgentToolCallCard(props: unknown) {
  const [open, setOpen] = useState(false);
  // assistant-ui's tool fallback receives flattened props. Pull what we need
  // defensively because the assistant-ui types are complex unions.
  const p = props as {
    toolName?: string;
    args?: unknown;
    result?: unknown;
    status?: { type?: string };
  };
  const toolName = p.toolName ?? "(unknown tool)";
  const args = p.args;
  const result = p.result;
  const state = p.status?.type ?? "running";

  const errorBlock = useMemo(() => {
    if (
      result &&
      typeof result === "object" &&
      "ok" in (result as Record<string, unknown>) &&
      (result as { ok: boolean }).ok === false
    ) {
      const err = (
        result as {
          error?: { code?: string; message?: string; body?: unknown };
        }
      ).error;
      if (err) {
        return (
          <ErrorBodyRenderer
            code={err.code ?? "error"}
            message={err.message ?? "Tool call failed"}
            body={err.body}
          />
        );
      }
    }
    return null;
  }, [result]);

  const ok =
    result &&
    typeof result === "object" &&
    "ok" in (result as Record<string, unknown>)
      ? (result as { ok: boolean }).ok
      : true;

  const summary = useMemo(() => {
    if (args && typeof args === "object" && args !== null) {
      const a = args as Record<string, unknown>;
      if (toolName === "createWorkflow" && typeof a.name === "string")
        return `name: ${a.name}`;
      if (
        toolName === "addNode" &&
        typeof a.node === "object" &&
        a.node !== null
      ) {
        const n = a.node as Record<string, unknown>;
        return `${String(n.type)} (id: ${String(n.id)})`;
      }
      if (
        toolName === "connectNodes" &&
        typeof a.sourceNodeId === "string" &&
        typeof a.targetNodeId === "string"
      ) {
        return `${a.sourceNodeId} → ${a.targetNodeId}`;
      }
      if (toolName === "publishDynamicNode" && typeof a.script === "string") {
        return `script (${a.script.length} chars)`;
      }
      if (toolName === "startRun" && typeof a.workflowId === "string") {
        return `workflow ${a.workflowId}`;
      }
    }
    return "";
  }, [toolName, args]);

  return (
    <Box
      data-testid={`agent-tool-call-${toolName}`}
      mt={6}
      mb={6}
      style={{
        border: ok ? "1px solid #d0bfff" : "1px solid #fa5252",
        borderRadius: 6,
        padding: 8,
        background: "#fff",
      }}
    >
      <Group justify="space-between" align="center">
        <Group gap={6}>
          <Badge size="xs" color={ok ? "violet" : "red"} variant="light">
            {toolName}
          </Badge>
          {summary && (
            <Text size="xs" c="dimmed">
              {summary}
            </Text>
          )}
          <Badge size="xs" color={ok ? "teal" : "red"} variant="outline">
            {state === "result" ? (ok ? "ok" : "error") : state}
          </Badge>
        </Group>
        <ActionIcon
          size="xs"
          variant="subtle"
          onClick={() => setOpen((o) => !o)}
          data-testid={`agent-tool-call-${toolName}-toggle`}
        >
          {open ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
        </ActionIcon>
      </Group>
      {open && (
        <Stack gap={6} mt={6}>
          <Box>
            <Text size="xs" c="dimmed" fw={700}>
              input
            </Text>
            <pre style={{ fontSize: 11, margin: 0, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(args, null, 2)}
            </pre>
          </Box>
          <Box>
            <Text size="xs" c="dimmed" fw={700}>
              output
            </Text>
            <pre style={{ fontSize: 11, margin: 0, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </Box>
        </Stack>
      )}
      {errorBlock !== null && <Box mt={6}>{errorBlock}</Box>}
    </Box>
  );
}

function Composer({
  workflowId,
  activeGroupId,
}: {
  workflowId: string | null;
  activeGroupId: string | null;
}) {
  const [attached, setAttached] = useState<
    Array<{
      filename: string;
      status: "uploading" | "ok" | "error";
      sourceNodeId?: string;
      message?: string;
    }>
  >([]);
  // queued holds files waiting for the agent to add a source.upload node.
  // Read inside the drain-event handler via setQueued's callback form.
  const [, setQueued] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const workflowIdRef = useRef<string | null>(workflowId);
  workflowIdRef.current = workflowId;

  async function uploadToSource(
    file: File,
    sourceNodeId: string,
    currentWorkflowId: string,
  ) {
    const placeholder = {
      filename: file.name,
      status: "uploading" as const,
    };
    setAttached((p) => [...p, placeholder]);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(
        `/api/workflows/${currentWorkflowId}/sources/${sourceNodeId}/upload`,
        {
          method: "POST",
          headers: Object.fromEntries(
            Object.entries(getAgentAuthHeaders(activeGroupId)).filter(
              ([k]) => k.toLowerCase() !== "content-type",
            ),
          ),
          body: form,
        },
      );
      if (res.ok) {
        setAttached((p) =>
          p.map((it) =>
            it === placeholder
              ? { ...it, status: "ok" as const, sourceNodeId }
              : it,
          ),
        );
      } else {
        const txt = await res.text().catch(() => "");
        setAttached((p) =>
          p.map((it) =>
            it === placeholder
              ? {
                  ...it,
                  status: "error" as const,
                  message: txt.slice(0, 200) || `HTTP ${res.status}`,
                }
              : it,
          ),
        );
      }
    } catch (err) {
      setAttached((p) =>
        p.map((it) =>
          it === placeholder
            ? {
                ...it,
                status: "error" as const,
                message: err instanceof Error ? err.message : String(err),
              }
            : it,
        ),
      );
    }
  }

  // Listen for the drain event fired by ToolCallNavigator when the agent
  // creates a source.upload node — auto-upload any queued files into it.
  useEffect(() => {
    function onDrain(e: Event) {
      const detail = (e as CustomEvent<{ sourceNodeId: string }>).detail;
      const wfId = workflowIdRef.current;
      if (!detail?.sourceNodeId || wfId === null) return;
      setQueued((q) => {
        for (const f of q) {
          void uploadToSource(f, detail.sourceNodeId, wfId);
        }
        return [];
      });
    }
    window.addEventListener("agent-chat:drain-queue", onDrain);
    return () => window.removeEventListener("agent-chat:drain-queue", onDrain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    return handleFilesArr(Array.from(files));
  }

  async function handleFilesArr(files: File[]) {
    if (files.length === 0) return;
    // No workflow yet — queue files. The agent's first createWorkflow tool
    // auto-seeds a source.upload entry node; the drain listener will pick
    // them up.
    if (workflowId === null) {
      setQueued((q) => [...q, ...Array.from(files)]);
      const items = Array.from(files).map((f) => ({
        filename: f.name,
        status: "uploading" as const,
        message: "queued — will upload after the agent creates the workflow",
      }));
      setAttached((p) => [...p, ...items]);
      return;
    }
    // Fetch workflow to find a source.upload node to upload into.
    // Source nodes are `{ type: "source", sourceType: "source.upload" }`.
    let sourceNodeId: string | null = null;
    try {
      const wfRes = await fetch(`/api/workflows/${workflowId}`, {
        headers: getAgentAuthHeaders(activeGroupId),
      });
      if (wfRes.ok) {
        const wf = (await wfRes.json()) as {
          workflow?: {
            config?: {
              nodes?: Record<string, { type?: string; sourceType?: string }>;
            };
          };
        };
        const nodes = wf.workflow?.config?.nodes ?? {};
        for (const [nodeId, node] of Object.entries(nodes)) {
          if (node?.type === "source" && node.sourceType === "source.upload") {
            sourceNodeId = nodeId;
            break;
          }
        }
      }
    } catch {
      // ignore — handled below
    }
    if (sourceNodeId === null) {
      // Queue + wait for agent to add a source.upload node.
      setQueued((q) => [...q, ...Array.from(files)]);
      const items = Array.from(files).map((f) => ({
        filename: f.name,
        status: "uploading" as const,
        message: "queued — ask the agent to add a source.upload node",
      }));
      setAttached((p) => [...p, ...items]);
      return;
    }
    for (const file of Array.from(files)) {
      await uploadToSource(file, sourceNodeId, workflowId);
    }
  }

  return (
    <Box
      p="sm"
      style={{ borderTop: "1px solid #e9ecef" }}
      data-testid="agent-chat-composer"
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        void handleFiles(e.dataTransfer.files);
      }}
    >
      {attached.length > 0 && (
        <Stack gap={4} mb={6}>
          {attached.map((it, idx) => (
            <Group key={idx} gap={6}>
              <Badge
                size="xs"
                color={
                  it.status === "ok"
                    ? "teal"
                    : it.status === "error"
                      ? "red"
                      : "gray"
                }
                variant="light"
                data-testid="agent-chat-attachment"
              >
                {it.filename}
                {it.status === "uploading" ? " (uploading…)" : ""}
                {it.status === "error" ? " (failed)" : ""}
                {it.status === "ok" && it.sourceNodeId
                  ? ` → ${it.sourceNodeId}`
                  : ""}
              </Badge>
              {it.status === "error" && it.message && (
                <Text size="xs" c="dimmed">
                  {it.message}
                </Text>
              )}
            </Group>
          ))}
        </Stack>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          // Capture the file list BEFORE clearing the input — FileList is
          // a live reference that empties when input.value is reset.
          const list = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = "";
          void handleFilesArr(list);
        }}
        data-testid="agent-chat-file-input"
      />
      <ComposerPrimitive.Root
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          width: "100%",
        }}
      >
        <Tooltip label="Attach a file (uploads to the workflow's source.upload node)">
          <ActionIcon
            size="lg"
            variant="subtle"
            onClick={() => fileInputRef.current?.click()}
            data-testid="agent-chat-attach"
            type="button"
          >
            <IconPaperclip size={18} />
          </ActionIcon>
        </Tooltip>
        <ComposerPrimitive.Input
          autoFocus
          placeholder="Ask the agent to build, edit, or run a workflow… (drop files to upload)"
          rows={1}
          data-testid="agent-chat-textarea"
          className="agent-chat-composer-input"
        />
        <ComposerPrimitive.Send asChild>
          <ActionIcon
            size="lg"
            variant="filled"
            color="violet"
            type="submit"
            data-testid="agent-chat-send"
          >
            <IconSend2 size={18} />
          </ActionIcon>
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </Box>
  );
}

/**
 * Side effect: watches the assistant runtime for the agent's first
 * `createWorkflow` tool call and navigates the user to the new
 * workflow's editor. Also watches for `addNode` tool calls that create
 * a `source.upload` node and drains any queued files into it.
 */
function ToolCallNavigator() {
  const runtime = useAssistantRuntime();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const navigatedRef = useRef<string | null>(null);
  const drainedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!runtime) return undefined;
    const unsub = runtime.thread.subscribe(() => {
      const state = runtime.thread.getState();
      const last = state.messages[state.messages.length - 1];
      if (!last || last.role !== "assistant") return;
      for (const part of last.content) {
        if (part.type !== "tool-call") continue;
        const result = (part as { result?: unknown }).result;
        // (1) Auto-navigate on createWorkflow
        if (
          (part as { toolName?: string }).toolName === "createWorkflow" &&
          result !== undefined &&
          typeof result === "object" &&
          result !== null &&
          "workflow" in (result as Record<string, unknown>) &&
          (result as { workflow?: { id?: string } }).workflow?.id
        ) {
          const id = (result as { workflow: { id: string } }).workflow.id;
          if (
            navigatedRef.current !== id &&
            !window.location.search.includes(`id=${id}`) &&
            !window.location.pathname.includes(`/workflows/${id}`)
          ) {
            navigatedRef.current = id;
            navigate(`/workflows/create-v2?id=${id}`);
          }
          queryClient.invalidateQueries({ queryKey: ["workflow", id] });
        }
        // (2) On every write tool-call, invalidate workflow query so the
        // canvas re-renders with the new graph state.
        const toolName = (part as { toolName?: string }).toolName;
        if (
          toolName &&
          [
            "addNode",
            "setNodeParameters",
            "connectNodes",
            "deleteNode",
            "setEntryNode",
            "declareCtx",
            "setCtxKind",
            "updateWorkflowMetadata",
          ].includes(toolName)
        ) {
          queryClient.invalidateQueries({ queryKey: ["workflow"] });
          queryClient.invalidateQueries({ queryKey: ["activity-catalog"] });
        }
        // (3) Drain queued files on addNode(source.upload).
        if (
          (part as { toolName?: string }).toolName === "addNode" &&
          result !== undefined &&
          typeof result === "object" &&
          result !== null &&
          "node" in (result as Record<string, unknown>)
        ) {
          const node = (result as { node?: { id?: string; type?: string } })
            .node;
          const toolCallId =
            (part as { toolCallId?: string }).toolCallId ??
            JSON.stringify(part);
          if (
            node?.type === "source.upload" &&
            node.id &&
            !drainedRef.current.has(toolCallId)
          ) {
            drainedRef.current.add(toolCallId);
            window.dispatchEvent(
              new CustomEvent("agent-chat:drain-queue", {
                detail: { sourceNodeId: node.id },
              }),
            );
          }
        }
      }
    });
    return () => {
      unsub?.();
    };
  }, [runtime, navigate, queryClient]);

  return null;
}
