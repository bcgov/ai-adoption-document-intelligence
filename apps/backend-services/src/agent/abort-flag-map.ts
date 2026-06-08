import { Injectable } from "@nestjs/common";

/**
 * Handle returned by {@link AbortFlagMap.register}. Carries the live
 * `AbortController` plus a `clear()` that performs a compare-and-delete:
 * it only removes the map entry if this exact controller is still the
 * one mapped to the conversation. This prevents a settled turn from
 * clearing a newer turn's controller (the abort-registry race).
 */
export interface AbortRegistration {
  readonly controller: AbortController;
  /**
   * Remove this registration from the map iff it is still the current
   * controller for its conversation. A no-op if a later `register()`
   * already replaced it.
   */
  clear(): void;
}

/**
 * In-memory cancellation tracker for in-flight agent streams. The
 * controller's SSE handler registers an `AbortController` keyed by
 * conversationId; a separate `POST /abort` endpoint signals it.
 * Survives only within a single backend process — sufficient for
 * Phase 7's one-stream-per-conversation model.
 */
@Injectable()
export class AbortFlagMap {
  private readonly controllers = new Map<string, AbortController>();

  /**
   * Register a fresh controller for `conversationId`. Aborts and
   * replaces any controller already mapped (a resent turn supersedes
   * the prior one). Returns a handle whose `clear()` only deletes the
   * map entry if this controller is still the mapped one — so the
   * previous turn's cleanup can never evict the replacement.
   */
  register(conversationId: string): AbortRegistration {
    const existing = this.controllers.get(conversationId);
    if (existing) {
      existing.abort();
    }
    const controller = new AbortController();
    this.controllers.set(conversationId, controller);
    return {
      controller,
      clear: () => {
        // Compare-and-delete: only evict if we're still the current
        // controller. If turn 2 re-registered after us, this is a no-op.
        if (this.controllers.get(conversationId) === controller) {
          this.controllers.delete(conversationId);
        }
      },
    };
  }

  abort(conversationId: string): boolean {
    const controller = this.controllers.get(conversationId);
    if (controller === undefined) return false;
    controller.abort();
    return true;
  }

  clear(conversationId: string): void {
    this.controllers.delete(conversationId);
  }
}
