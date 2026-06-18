import { DocumentField, ExtractedFields } from "@/shared/types";
import { Badge, DataTable, Text } from "@/ui";

function getFieldDisplayValue(field: DocumentField): string {
  if (field.valueSelectionMark !== undefined) {
    return field.valueSelectionMark === "selected"
      ? "☑ Selected"
      : "☐ Unselected";
  }
  if (field.valueNumber !== undefined) {
    return field.valueNumber.toString();
  }
  if (field.valueDate !== undefined) {
    return field.valueDate;
  }
  if (field.valueString !== undefined) {
    return field.valueString;
  }
  return field.content || "—";
}

const ExtractedFieldsTable = ({ fields }: { fields: ExtractedFields }) => {
  const entries = Object.entries(fields);

  if (entries.length === 0) {
    return <Text c="dimmed">No fields extracted.</Text>;
  }

  return (
    <DataTable
      striped
      highlightOnHover
      withTableBorder
      style={{
        tableLayout: "fixed",
        width: "100%",
        marginBottom: "2rem",
      }}
    >
      <DataTable.Thead>
        <DataTable.Tr>
          <DataTable.Th style={{ width: "25%" }}>Field</DataTable.Th>
          <DataTable.Th style={{ width: "45%" }}>Value</DataTable.Th>
          <DataTable.Th style={{ width: "15%" }}>Type</DataTable.Th>
          <DataTable.Th style={{ width: "15%" }}>Confidence</DataTable.Th>
        </DataTable.Tr>
      </DataTable.Thead>
      <DataTable.Tbody>
        {entries.map(([name, field]) => (
          <DataTable.Tr key={name}>
            <DataTable.Td style={{ wordBreak: "break-word" }}>
              <Text size="sm" fw={500}>
                {name}
              </Text>
            </DataTable.Td>
            <DataTable.Td style={{ wordBreak: "break-word" }}>
              <Text size="sm">{getFieldDisplayValue(field)}</Text>
            </DataTable.Td>
            <DataTable.Td>
              <Badge size="xs" variant="light">
                {field.type}
              </Badge>
            </DataTable.Td>
            <DataTable.Td>
              <Text
                size="sm"
                c={
                  field.confidence >= 0.9
                    ? "green"
                    : field.confidence >= 0.7
                      ? "yellow"
                      : "red"
                }
              >
                {(field.confidence * 100).toFixed(1)}%
              </Text>
            </DataTable.Td>
          </DataTable.Tr>
        ))}
      </DataTable.Tbody>
    </DataTable>
  );
};

export default ExtractedFieldsTable;
