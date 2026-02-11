import { Card, Stack, Text } from "@mantine/core";
import { FC } from "react";

interface CorrectionHistoryProps {
  corrections: Array<{
    id: string;
    fieldKey: string;
    originalValue?: string;
    correctedValue?: string;
    action: string;
    createdAt: string;
  }>;
}

export const CorrectionHistory: FC<CorrectionHistoryProps> = ({
  corrections,
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
