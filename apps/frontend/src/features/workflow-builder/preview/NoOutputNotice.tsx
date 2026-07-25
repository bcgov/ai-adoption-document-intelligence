/**
 * `NoOutputNotice` — the single rendering of a `NoOutputReason` (G-012).
 *
 * Both preview surfaces (the node-card `PreviewWidget` and the wire
 * `WirePeekPopover`) route every "no output here" branch through this
 * component, so the copy for a given reason cannot differ between them.
 *
 * `evicted` is NOT rendered here: it is the only reason with a recovery
 * action, and that action (`CacheEvictedAlert`'s Re-run, which refetches the
 * historical `initialCtx` and POSTs a fresh run) belongs to the surface that
 * knows the workflow/run/node ids. Callers branch on `copy.offersRerun`.
 */

import { Alert, Text } from "@mantine/core";
import type { ReactNode } from "react";

import { describeNoOutput, type NoOutputReason } from "./no-output-state";

export interface NoOutputNoticeProps {
  reason: NoOutputReason;
}

export function NoOutputNotice({ reason }: NoOutputNoticeProps): ReactNode {
  const copy = describeNoOutput(reason);
  if (copy.tone === "silent") {
    // Nothing to say, but the caller's wrapper still carries `data-state` so
    // the state is observable rather than an indistinguishable blank card.
    return null;
  }
  if (copy.tone === "neutral") {
    return (
      <Text size="xs" c="dimmed" data-testid={`no-output-${reason}`}>
        {copy.message}
      </Text>
    );
  }
  return (
    <Alert color="gray" variant="light" data-testid={`no-output-${reason}`}>
      <Text size="xs">{copy.message}</Text>
    </Alert>
  );
}
