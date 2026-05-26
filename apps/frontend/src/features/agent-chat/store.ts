import { create } from "zustand";

export type AgentProvider = "azure" | "anthropic";

export interface AgentModelOption {
  label: string;
  provider: AgentProvider;
  model: string;
}

export const AGENT_MODEL_OPTIONS: AgentModelOption[] = [
  {
    label: "Claude Haiku 4.5 (cheap, recommended for testing)",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
  },
  {
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
  },
  {
    label: "Claude Opus 4.7 (1M context)",
    provider: "anthropic",
    model: "claude-opus-4-7",
  },
  {
    label: "Azure GPT-4o (multi-provider verification)",
    provider: "azure",
    model: "gpt-4o",
  },
];

interface AgentChatState {
  isOpen: boolean;
  conversationId: string | null;
  workflowId: string | null;
  selectedModel: AgentModelOption;
  open(): void;
  close(): void;
  toggle(): void;
  setConversationId(id: string | null): void;
  setWorkflowId(id: string | null): void;
  setSelectedModel(option: AgentModelOption): void;
  resetConversation(): void;
}

export const useAgentChatStore = create<AgentChatState>((set) => ({
  isOpen: false,
  conversationId: null,
  workflowId: null,
  selectedModel: AGENT_MODEL_OPTIONS[0],
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  setConversationId: (id) => set({ conversationId: id }),
  setWorkflowId: (id) => set({ workflowId: id }),
  setSelectedModel: (option) => set({ selectedModel: option }),
  resetConversation: () => set({ conversationId: null }),
}));
