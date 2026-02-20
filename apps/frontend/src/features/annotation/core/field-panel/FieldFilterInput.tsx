import { Text, TextInput } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { FC } from "react";

interface FieldFilterInputProps {
  value: string;
  onChange: (value: string) => void;
  totalCount: number;
  filteredCount: number;
}

export const FieldFilterInput: FC<FieldFilterInputProps> = ({
  value,
  onChange,
  totalCount,
  filteredCount,
}) => {
  return (
    <>
      <TextInput
        size="sm"
        placeholder="Search fields"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        leftSection={<IconSearch size={16} />}
      />
      {filteredCount !== totalCount && (
        <Text size="xs" c="dimmed">
          Showing {filteredCount} of {totalCount} fields
        </Text>
      )}
    </>
  );
};
