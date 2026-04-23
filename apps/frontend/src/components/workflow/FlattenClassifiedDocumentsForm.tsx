import { Stack, Text, TextInput } from "@mantine/core";
import type { ActivityNode } from "../../types/graph-workflow";

export interface FlattenClassifiedDocumentsFormProps {
  node: ActivityNode;
  onChange: (node: ActivityNode) => void;
}

/**
 * Specialised activity form for `document.flattenClassifiedDocuments` workflow nodes.
 *
 * Renders a text input for the optional `filterLabels` parameter. When left blank,
 * all labels are flattened. Enter comma-separated label names to restrict output to
 * those labels only.
 *
 * @param props.node - The current activity node configuration.
 * @param props.onChange - Callback invoked with the updated node on any change.
 */
export function FlattenClassifiedDocumentsForm({
  node,
  onChange,
}: FlattenClassifiedDocumentsFormProps) {
  const params = (node.parameters ?? {}) as Record<string, unknown>;
  const filterLabels = params.filterLabels as string[] | undefined;

  const handleFilterLabelsChange = (value: string) => {
    const labels = value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    onChange({
      ...node,
      parameters: {
        ...node.parameters,
        filterLabels: labels.length > 0 ? labels : undefined,
      },
    });
  };

  return (
    <Stack gap="sm">
      <Text size="sm" fw={600}>
        Flatten classified documents parameters
      </Text>
      <TextInput
        label="Filter labels (optional)"
        description="Comma-separated list of classifier labels to include. Leave blank to include all labels."
        placeholder="e.g. invoice, receipt"
        value={(filterLabels ?? []).join(", ")}
        onChange={(e) => handleFilterLabelsChange(e.currentTarget.value)}
      />
    </Stack>
  );
}
