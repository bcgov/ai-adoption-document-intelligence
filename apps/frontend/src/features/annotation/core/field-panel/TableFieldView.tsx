import { FC } from "react";
import { Stack, Text } from "../../../../ui";

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
