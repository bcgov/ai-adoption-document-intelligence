import { useGroup } from "../../auth/GroupContext";
import { useClassifier } from "../../data/hooks/useClassifier";
import { ClassifierStatus } from "../../shared/types/classifier";
import type { ActivityNode } from "../../types/graph-workflow";
import { Alert, Select, Stack, Text } from "../../ui";

export interface AzureClassifySubmitFormProps {
  node: ActivityNode;
  onChange: (node: ActivityNode) => void;
}

/**
 * Specialised activity form for `azureClassify.submit` workflow nodes.
 *
 * Renders a classifier dropdown populated with READY classifiers scoped to
 * the current group. Selecting a classifier writes the classifier name into
 * `node.parameters.classifierName`.
 *
 * @param props.node - The current activity node configuration.
 * @param props.onChange - Callback invoked with the updated node on any change.
 */
export function AzureClassifySubmitForm({
  node,
  onChange,
}: AzureClassifySubmitFormProps) {
  const { activeGroup } = useGroup();
  const { getClassifiers } = useClassifier();

  const readyClassifiers = (getClassifiers.data ?? []).filter(
    (c) => c.status === ClassifierStatus.READY,
  );

  const params = (node.parameters ?? {}) as Record<string, unknown>;

  const handleClassifierChange = (value: string | null) => {
    onChange({
      ...node,
      parameters: {
        ...node.parameters,
        classifierName: value ?? undefined,
      },
    });
  };

  return (
    <Stack gap="sm">
      <Text size="sm" fw={600}>
        Azure classifier parameters
      </Text>
      {!activeGroup && (
        <Alert
          color="yellow"
          title="No group selected"
          data-testid="classifier-no-group-alert"
        >
          Select a group to load available classifiers.
        </Alert>
      )}
      {getClassifiers.isError && (
        <Alert
          color="red"
          title="Failed to load classifiers"
          data-testid="classifier-fetch-error-alert"
        >
          Could not fetch classifiers. please try again.
        </Alert>
      )}
      <Select
        label="Classifier"
        description="Select a trained (READY) classifier for this group"
        placeholder={
          getClassifiers.isLoading
            ? "Loading classifiers…"
            : "Select classifier"
        }
        disabled={
          getClassifiers.isLoading || getClassifiers.isError || !activeGroup
        }
        data={readyClassifiers.map((c) => ({
          value: c.name,
          label: c.name,
        }))}
        value={(params.classifierName as string) ?? null}
        onChange={handleClassifierChange}
        searchable
        clearable
      />
    </Stack>
  );
}
