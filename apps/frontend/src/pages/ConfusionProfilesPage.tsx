import { type JSX } from "react";
import { useGroup } from "../auth/GroupContext";
import { ConfusionProfilesPanel } from "../features/benchmarking/components/ConfusionProfilesPanel";
import { PageHeader, Stack, Text } from "../ui";

/**
 * Standalone page for managing confusion profiles for the active group.
 * Accessible at `/confusion-profiles`.
 */
export function ConfusionProfilesPage(): JSX.Element {
  const { activeGroup } = useGroup();

  return (
    <Stack gap="lg">
      <PageHeader
        title="Confusion profiles"
        description="Manage OCR confusion profiles for the active group."
      />
      {activeGroup ? (
        <ConfusionProfilesPanel groupId={activeGroup.id} />
      ) : (
        <Text c="dimmed">No group selected.</Text>
      )}
    </Stack>
  );
}
