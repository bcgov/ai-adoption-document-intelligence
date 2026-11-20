/**
 * Pure formatter for a one-line summary of a `LibraryPortDescriptor`.
 *
 * Used by the library picker preview (`LibraryPickerModal`) and the
 * `childWorkflow` settings signature summary (`ChildWorkflowNodeSettings`)
 * to surface the port's typed-I/O `kind` alongside its runtime `type`
 * (US-100 Scenarios 1 + 2).
 *
 * Returns `"<label> (<type>, <kind>)"` when `kind` is declared,
 * `"<label> (<type>)"` otherwise — no parenthesised kind segment when
 * absent (clean fallback, Scenario 3).
 */

import type { LibraryPortDescriptor } from "@ai-di/graph-workflow";

export function formatLibraryPortSummary(port: LibraryPortDescriptor): string {
  const segments: string[] = [port.type];
  if (port.kind !== undefined) {
    segments.push(port.kind);
  }
  return `${port.label} (${segments.join(", ")})`;
}
