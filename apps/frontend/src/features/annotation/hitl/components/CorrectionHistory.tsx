import { IconArrowRight } from "@tabler/icons-react";
import { FC } from "react";
import { Badge, Card, Group, Stack, Text } from "../../../../ui";

interface CorrectionAuthor {
  type: "user" | "api_key" | "unknown";
  email?: string;
}

interface CorrectionHistoryProps {
  corrections: Array<{
    id: string;
    fieldKey: string;
    originalValue?: string;
    correctedValue?: string;
    action: string;
    createdAt: string;
    author: CorrectionAuthor;
  }>;
}

const ACTION_COLORS: Record<string, string> = {
  corrected: "blue",
  confirmed: "green",
  flagged: "orange",
  deleted: "red",
};

function authorLabel(author: CorrectionAuthor): string {
  switch (author.type) {
    case "user":
      return author.email || "Unknown user";
    case "api_key":
      return "API key";
    default:
      return "Unknown";
  }
}

function ValueDiff({
  originalValue,
  correctedValue,
}: {
  originalValue?: string;
  correctedValue?: string;
}) {
  return (
    <Group gap="xs" align="center" wrap="nowrap">
      {originalValue !== undefined && (
        <Card withBorder radius="sm" style={{ flex: 1, padding: "0em 1em" }}>
          <Text size="sm" data-testid="correction-original">
            {originalValue || "—"}
          </Text>
        </Card>
      )}
      {originalValue !== undefined && correctedValue !== undefined && (
        <IconArrowRight size={16} style={{ flexShrink: 0 }} />
      )}
      {correctedValue !== undefined && (
        <Card withBorder radius="sm" style={{ flex: 1, padding: "0em 1em" }}>
          <Text size="sm" fw={600} data-testid="correction-corrected">
            {correctedValue || "—"}
          </Text>
        </Card>
      )}
    </Group>
  );
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
        <Card key={correction.id} withBorder padding="md">
          <Stack gap={4}>
            <Group gap="xs" wrap="nowrap">
              <Badge color={ACTION_COLORS[correction.action] || "gray"}>
                {correction.action}
              </Badge>
              <Text size="sm" fw={600} ml={30}>
                {correction.fieldKey}
              </Text>
              <Stack gap={0} ml={"auto"} align="end">
                <Text size="xs" c="dimmed" mb={0}>
                  {authorLabel(correction.author)}
                </Text>
                <Text size="xs" c="dimmed" mb={0} mt={0}>
                  {new Date(correction.createdAt).toLocaleString()}
                </Text>
              </Stack>
            </Group>
            {correction.originalValue && correction.correctedValue && (
              <ValueDiff
                originalValue={correction.originalValue}
                correctedValue={correction.correctedValue}
              />
            )}
          </Stack>
        </Card>
      ))}
    </Stack>
  );
};
