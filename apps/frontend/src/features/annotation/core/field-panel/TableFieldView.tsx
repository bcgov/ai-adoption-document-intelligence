import { FC } from "react";
import { Text, Stack } from "@mantine/core";

interface TableFieldViewProps {
  value?: string;
}

export const TableFieldView: FC<TableFieldViewProps> = ({ value }) => {
  return (
    <Stack gap={4}>
      <Text size="xs" c="dimmed">
        Table values are edited in bulk.
      </Text>
      <Text size="xs">{value || "No rows captured yet."}</Text>
    </Stack>
  );
};
