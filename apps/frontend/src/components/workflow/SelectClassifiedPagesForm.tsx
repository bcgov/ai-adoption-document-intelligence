import { Stack, Text, TextInput } from "@mantine/core";
import type { ActivityNode } from "../../types/graph-workflow";

export interface SelectClassifiedPagesFormProps {
  node: ActivityNode;
  onChange: (node: ActivityNode) => void;
}

/**
 * Specialised activity form for `document.selectClassifiedPages` workflow nodes.
 *
 * Renders a text input for `targetLabel` — the classifier label whose detected
 * segments will be returned as a sorted array. The label must exactly match a
 * key in the `labeledDocuments` output from `azureClassify.poll`.
 *
 * @param props.node - The current activity node configuration.
 * @param props.onChange - Callback invoked with the updated node on any change.
 */
export function SelectClassifiedPagesForm({
  node,
  onChange,
}: SelectClassifiedPagesFormProps) {
  const params = (node.parameters ?? {}) as Record<string, unknown>;

  const handleLabelChange = (value: string) => {
    onChange({
      ...node,
      parameters: {
        ...node.parameters,
        targetLabel: value || undefined,
      },
    });
  };

  return (
    <Stack gap="sm">
      <Text size="sm" fw={600}>
        Select classified pages parameters
      </Text>
      <TextInput
        label="Target label"
        description="Classifier label to select segments for (must match a key in labeledDocuments)"
        placeholder="e.g. invoice"
        value={(params.targetLabel as string) ?? ""}
        onChange={(e) => handleLabelChange(e.currentTarget.value)}
      />
    </Stack>
  );
}
