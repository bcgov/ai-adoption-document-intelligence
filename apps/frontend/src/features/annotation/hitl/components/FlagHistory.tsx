import { IconCheck, IconFlag } from "@tabler/icons-react";
import { FC } from "react";
import { Button, Group, Stack, Text } from "../../../../ui";

export interface ReviewFlag {
  id: string;
  note: string | null;
  raisedAt: string;
  raisedBy: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

interface FlagHistoryProps {
  flags: ReviewFlag[];
  flagNote?: string | null;
  readOnly: boolean;
  resolvingFlagId: string | null;
  onResolve: (flagId: string) => void;
}

export const FlagHistory: FC<FlagHistoryProps> = ({
  flags,
  flagNote,
  readOnly,
  resolvingFlagId,
  onResolve,
}) => {
  if (flags.length === 0) {
    return (
      <Text size="sm" c={flagNote ? undefined : "dimmed"}>
        {flagNote || "No active flags."}
      </Text>
    );
  }

  return (
    <Stack gap="sm">
      {flags.map((flag) => (
        <Group
          key={flag.id}
          justify="space-between"
          align="flex-start"
          wrap="nowrap"
          style={{
            border: flag.resolved
              ? "1px solid var(--mantine-color-green-3)"
              : "1px solid var(--mantine-color-yellow-4)",
            borderRadius: "5px",
            padding: "0.5em 1em",
          }}
        >
          <Stack gap={0} style={{ flex: 1, width: "100%" }}>
            <Group w={"100%"}>
              {flag.resolved ? (
                <IconCheck color="var(--mantine-color-green-3)" />
              ) : (
                <IconFlag color="var(--mantine-color-yellow-4)" />
              )}
              <Button
                size="xs"
                variant="light"
                disabled={readOnly || flag.resolved}
                style={{
                  padding: "0 1em",
                  position: "relative",
                  marginLeft: "auto",
                }}
                loading={resolvingFlagId === flag.id}
                onClick={() => onResolve(flag.id)}
              >
                {flag.resolved ? "Resolved" : "Resolve"}
              </Button>
            </Group>
            <Text size="sm">{flag.note || "(no note)"}</Text>
            <Text size="xs" c="dimmed" mb={0}>
              Raised{flag.raisedBy ? ` by ${flag.raisedBy}` : ""}
            </Text>
            <Text size="xs" c="dimmed" mt={0}>
              {new Date(flag.raisedAt).toLocaleString()}
            </Text>
            {flag.resolved && (
              <>
                <Text size="xs" c="dimmed" mb={0}>
                  Resolved{flag.resolvedBy ? ` by ${flag.resolvedBy}` : ""}
                </Text>
                <Text size="xs" c="dimmed" mt={0}>
                  {new Date(flag.resolvedAt as string).toLocaleString()}
                </Text>
              </>
            )}
          </Stack>
        </Group>
      ))}
    </Stack>
  );
};
