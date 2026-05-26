import { Injectable } from "@nestjs/common";

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

  register(conversationId: string): AbortController {
    const existing = this.controllers.get(conversationId);
    if (existing) {
      existing.abort();
    }
    const controller = new AbortController();
    this.controllers.set(conversationId, controller);
    return controller;
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
