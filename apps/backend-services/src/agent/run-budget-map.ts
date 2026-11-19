import { Injectable } from "@nestjs/common";

/**
 * In-memory per-conversation live-run counter. Guards the Azure/OCR bill
 * from a runaway agent test-fix loop. Survives only within a single backend
 * process — sufficient, since the risk is a runaway within one live session.
 * Composes with the per-conversation token ceiling in {@link AgentEnv}.
 */
@Injectable()
export class RunBudgetMap {
  private readonly counts = new Map<string, number>();

  /**
   * Record one run against `conversationId`. Returns `true` if it was within
   * `max` (the run may proceed), `false` once the cap is reached.
   */
  tryConsume(conversationId: string, max: number): boolean {
    const used = this.counts.get(conversationId) ?? 0;
    if (used >= max) return false;
    this.counts.set(conversationId, used + 1);
    return true;
  }

  /** Runs still allowed for this conversation (never negative). */
  remaining(conversationId: string, max: number): number {
    return Math.max(0, max - (this.counts.get(conversationId) ?? 0));
  }
}
