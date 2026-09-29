import { FC } from "react";
import { Card, Stack, Text } from "../../../../ui";

interface CorrectionHistoryProps {
  corrections: Array<{
    id: string;
    fieldKey: string;
    originalValue?: string;
    correctedValue?: string;
    action: string;
    createdAt: string;
  }>;
  /**
   * G-058 — who made these corrections. The trail recorded what changed and
   * when but never who, so "who changed this number" — the question that
   * tends to arrive urgently — had no answer on any surface.
   *
   * Session-scoped: every correction here belongs to one review session, and
   * a session has exactly one reviewer, so this is named once above the list
   * rather than repeated on every row.
   */
  reviewerEmail?: string;
}

export const CorrectionHistory: FC<CorrectionHistoryProps> = ({
  corrections,
  reviewerEmail,
}) => {
  if (corrections.length === 0) {
    return (
      <Card withBorder padding="md">
        <Text size="sm" c="dimmed">
          No corrections submitted yet.
        </Text>
      </Card>
    );
  }

  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed" data-testid="correction-history-reviewer">
        Corrected by {reviewerEmail ?? "an unknown reviewer"}
      </Text>
      {corrections.map((correction) => (
        <Card key={correction.id} withBorder padding="sm">
          <Stack gap={4}>
            <Text size="sm" fw={600}>
              {correction.fieldKey}
            </Text>
            <Text size="xs" c="dimmed">
              {correction.action} ·{" "}
              {new Date(correction.createdAt).toLocaleString()}
            </Text>
            {(correction.originalValue || correction.correctedValue) && (
              <Text size="sm">
                {correction.originalValue || "—"} →{" "}
                {correction.correctedValue || "—"}
              </Text>
            )}
          </Stack>
        </Card>
      ))}
    </Stack>
  );
};
