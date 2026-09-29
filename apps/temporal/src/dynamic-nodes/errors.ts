/**
 * Phase 6 Milestone C (US-168) — typed error class hierarchy for dynamic-node
 * execution. Seven concrete subclasses + a shared `DynamicNodeError` base.
 *
 * Each subclass carries the structured data the Phase 7 agent needs to revise
 * a failing script without parsing free-form prose, and each implements a
 * `toErrorMessage()` method whose return value is the exact string written
 * into `NodeRunStatus.errorMessage` (Phase 4's status surface — see
 * `apps/temporal/src/graph-engine/graph-runner.ts`). Phase 4 already
 * truncates that field to 2 KB downstream; this module never truncates.
 *
 * Two of the seven (`DynamicNodeDeletedError`, `DynamicNodeVersionNotFoundError`,
 * `DynamicNodeHeadMissingError`) are thrown executor-side from
 * `resolve-lineage.activity.ts` (US-171). The other four
 * (`DynamicNodeTimeoutError`, `DynamicNodeStdoutTooLargeError`,
 * `DynamicNodeRuntimeError`, `DynamicNodeOutputInvalidJsonError`,
 * `DynamicNodeOutputShapeError`) are thrown activity-time from
 * `dyn-run.activity.ts` (US-170). All seven share this hierarchy + the same
 * Temporal-serialisation path.
 *
 * Spec: feature-docs/20260601-workflow-builder-phase6-dynamic-nodes/REQUIREMENTS.md
 * §3.3 L34 + user_stories/US-168-error-class-hierarchy.md.
 */

/**
 * Shared base class — every dynamic-node error extends this so a catch
 * handler can do `if (err instanceof DynamicNodeError)` and recognise any of
 * the seven concrete subclasses uniformly.
 */
export abstract class DynamicNodeError extends Error {
  abstract toErrorMessage(): string;
}

/**
 * Thrown executor-side when a workflow node references a `dyn.<slug>` whose
 * lineage row is soft-deleted (`deletedAt != null`) or absent. Per the
 * 404-vs-403 convention, "doesn't exist" and "soft-deleted" are
 * indistinguishable to the workflow.
 */
export class DynamicNodeDeletedError extends DynamicNodeError {
  readonly slug: string;

  constructor(slug: string) {
    super(`Dynamic node '${slug}' is deleted or does not exist`);
    this.name = "DynamicNodeDeletedError";
    this.slug = slug;
  }

  toErrorMessage(): string {
    return `[DynamicNodeDeletedError] slug=${this.slug}`;
  }
}

/**
 * Thrown executor-side when a workflow node pins a specific
 * `dynamicNodeVersion: N` that does not exist for the lineage.
 */
export class DynamicNodeVersionNotFoundError extends DynamicNodeError {
  readonly slug: string;
  readonly version: number;

  constructor(slug: string, version: number) {
    super(`Dynamic node '${slug}' has no version ${version}`);
    this.name = "DynamicNodeVersionNotFoundError";
    this.slug = slug;
    this.version = version;
  }

  toErrorMessage(): string {
    return `[DynamicNodeVersionNotFoundError] slug=${this.slug} version=${this.version}`;
  }
}

/**
 * Thrown executor-side when the lineage exists but its `headVersionId` is
 * null and the workflow node did not pin a specific version. Should not
 * happen in 6.0 (no per-version delete exists), but the executor guards
 * against future schema changes.
 */
export class DynamicNodeHeadMissingError extends DynamicNodeError {
  readonly slug: string;

  constructor(slug: string) {
    super(`Dynamic node '${slug}' has no head version`);
    this.name = "DynamicNodeHeadMissingError";
    this.slug = slug;
  }

  toErrorMessage(): string {
    return `[DynamicNodeHeadMissingError] slug=${this.slug}`;
  }
}

/**
 * Thrown activity-time when the runner reports `timedOut: true` (the user
 * script exceeded the signature's `timeoutMs`). The runner kills the Deno
 * subprocess server-side; the activity surfaces the typed error so Phase 4's
 * `NodeRunStatus` shows a structured failure rather than a generic crash.
 */
export class DynamicNodeTimeoutError extends DynamicNodeError {
  readonly slug: string;
  readonly versionId: string;
  readonly timeoutMs: number;

  constructor(slug: string, versionId: string, timeoutMs: number) {
    super(
      `Dynamic node '${slug}' (version ${versionId}) timed out after ${timeoutMs}ms`,
    );
    this.name = "DynamicNodeTimeoutError";
    this.slug = slug;
    this.versionId = versionId;
    this.timeoutMs = timeoutMs;
  }

  toErrorMessage(): string {
    return `[DynamicNodeTimeoutError] slug=${this.slug} versionId=${this.versionId} timeoutMs=${this.timeoutMs}`;
  }
}

/**
 * Thrown activity-time when the runner reports `stdoutTooLarge: true`. The
 * runner caps stdout at 5 MB to protect container memory; if the user
 * script exceeds the cap the subprocess is SIGKILLed and this typed error
 * surfaces.
 */
export class DynamicNodeStdoutTooLargeError extends DynamicNodeError {
  readonly slug: string;
  readonly versionId: string;
  readonly capBytes: number;
  readonly actualBytes?: number;

  constructor(
    slug: string,
    versionId: string,
    capBytes: number,
    actualBytes?: number,
  ) {
    super(
      `Dynamic node '${slug}' (version ${versionId}) stdout exceeded cap of ${capBytes} bytes`,
    );
    this.name = "DynamicNodeStdoutTooLargeError";
    this.slug = slug;
    this.versionId = versionId;
    this.capBytes = capBytes;
    this.actualBytes = actualBytes;
  }

  toErrorMessage(): string {
    const actual =
      this.actualBytes !== undefined ? ` actualBytes=${this.actualBytes}` : "";
    return `[DynamicNodeStdoutTooLargeError] slug=${this.slug} versionId=${this.versionId} capBytes=${this.capBytes}${actual}`;
  }
}

/**
 * Thrown activity-time when the runner reports a non-zero `exitCode`. The
 * agent's revision loop relies on `stderrTail` to target its fix — the
 * runner returns the full stderr in the response and the worker keeps the
 * last 2 KB before constructing this error.
 */
export class DynamicNodeRuntimeError extends DynamicNodeError {
  readonly slug: string;
  readonly versionId: string;
  readonly exitCode: number;
  readonly stderrTail: string;

  constructor(
    slug: string,
    versionId: string,
    exitCode: number,
    stderrTail: string,
  ) {
    super(
      `Dynamic node '${slug}' (version ${versionId}) exited with code ${exitCode}`,
    );
    this.name = "DynamicNodeRuntimeError";
    this.slug = slug;
    this.versionId = versionId;
    this.exitCode = exitCode;
    this.stderrTail = stderrTail;
  }

  toErrorMessage(): string {
    return `[DynamicNodeRuntimeError] slug=${this.slug} versionId=${this.versionId} exitCode=${this.exitCode}\n${this.stderrTail}`;
  }
}

/**
 * Thrown activity-time when the runner returns `exitCode: 0` but the
 * stdout payload is not valid JSON. The worker keeps the first 500 chars of
 * stdout so the agent can see what the script actually printed.
 */
export class DynamicNodeOutputInvalidJsonError extends DynamicNodeError {
  readonly slug: string;
  readonly versionId: string;
  readonly stdoutHead: string;

  constructor(slug: string, versionId: string, stdoutHead: string) {
    super(
      `Dynamic node '${slug}' (version ${versionId}) wrote non-JSON stdout`,
    );
    this.name = "DynamicNodeOutputInvalidJsonError";
    this.slug = slug;
    this.versionId = versionId;
    this.stdoutHead = stdoutHead;
  }

  toErrorMessage(): string {
    return `[DynamicNodeOutputInvalidJsonError] slug=${this.slug} versionId=${this.versionId}\n${this.stdoutHead}`;
  }
}

/**
 * Thrown activity-time when the parsed stdout JSON is missing one or more
 * of the output ports declared in the signature. The agent revises the
 * script to return the missing ports.
 */
export class DynamicNodeOutputShapeError extends DynamicNodeError {
  readonly slug: string;
  readonly versionId: string;
  readonly missingPorts: string[];

  constructor(slug: string, versionId: string, missingPorts: string[]) {
    super(
      `Dynamic node '${slug}' (version ${versionId}) output is missing declared ports: ${missingPorts.join(", ")}`,
    );
    this.name = "DynamicNodeOutputShapeError";
    this.slug = slug;
    this.versionId = versionId;
    this.missingPorts = missingPorts;
  }

  toErrorMessage(): string {
    return `[DynamicNodeOutputShapeError] slug=${this.slug} versionId=${this.versionId} missingPorts=${this.missingPorts.join(",")}`;
  }
}
