import { create } from "zustand";

export type AgentProvider = "azure" | "anthropic";

/**
 * One model the backend reports it can serve, from `GET /api/agent/models`.
 * There is no hardcoded list any more: a frontend array of model names could
 * only ever be a guess about someone else's configuration, and the guess was
 * wrong — every turn sent `gpt-5.4` (the first array element) whatever the
 * server had deployed (Inderdeep, 2026-08-06 — item 23).
 */
export interface AgentModelOption {
  /** Long, unambiguous form — "Azure OpenAI — gpt-4o". The accessible name. */
  label: string;
  /**
   * Short name for the composer's inline picker trigger — "Haiku 4.5", or an
   * Azure deployment name verbatim. Supplied by the backend, never parsed
   * here: the frontend has no way to know what a deployment is.
   */
  name: string;
  /**
   * "Fast" / "Balanced" / "Deep reasoning", or `null` when the backend has
   * nothing real to say about this model — a privately-named Azure deployment
   * has no published positioning, and a made-up tier would be worse than a
   * missing one. The picker renders the name alone in that case.
   */
  tier: string | null;
  provider: AgentProvider;
  model: string;
  /** The entry the backend uses when a turn names no provider/model. */
  isDefault: boolean;
}

interface AgentChatState {
  isOpen: boolean;
  conversationId: string | null;
  workflowId: string | null;
  /**
   * `null` until the backend's model list arrives — and it stays null if the
   * list cannot be loaded. A turn sent with no selection omits
   * `provider`/`model` from the request, so the backend applies its own
   * configured default rather than the frontend inventing one.
   */
  selectedModel: AgentModelOption | null;
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
  selectedModel: null,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  setConversationId: (id) => set({ conversationId: id }),
  setWorkflowId: (id) => set({ workflowId: id }),
  setSelectedModel: (option) => set({ selectedModel: option }),
  resetConversation: () => set({ conversationId: null }),
}));
