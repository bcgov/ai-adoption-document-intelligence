/**
 * Compare-to-head modal (Phase 2 Track 3 — US-084).
 *
 * Opens from `VersionHistoryDrawer`'s per-row "Compare to head" button.
 * Renders two side-by-side read-only Mantine `<JsonInput>` blocks: left
 * = the selected (older) version's config (fetched via
 * `useWorkflowVersion`), right = the current head's config (passed in
 * from the editor page's already-loaded `useWorkflow(lineageId)` —
 * no extra fetch).
 *
 * Per REQUIREMENTS D1 this is intentionally NOT a structural / line
 * diff — two JsonInput blocks is the explicit Track 3 deliverable.
 * Structural diff is filed for Phase 4.
 */

import {
  Alert,
  JsonInput,
  Modal,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import {
  useWorkflowVersion,
  type WorkflowInfo,
} from "../../../data/hooks/useWorkflows";

export interface CompareToHeadModalProps {
  opened: boolean;
  onClose: () => void;
  lineageId: string;
  /** The non-head version being compared against head. */
  selectedVersionId: string;
  selectedVersionNumber: number;
  /** ISO timestamp string for the selected version. */
  selectedCreatedAt: string;
  /** Already-loaded head WorkflowInfo — reused from `useWorkflow`. */
  headWorkflow: WorkflowInfo;
}

export function CompareToHeadModal({
  opened,
  onClose,
  lineageId,
  selectedVersionId,
  selectedVersionNumber,
  selectedCreatedAt,
  headWorkflow,
}: CompareToHeadModalProps) {
  const versionQuery = useWorkflowVersion(lineageId, selectedVersionId);

  const headConfigJson = JSON.stringify(headWorkflow.config, null, 2);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="80%"
      title="Compare to head"
      data-testid="compare-to-head-modal"
    >
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Stack gap="xs" data-testid="compare-left-column">
          <Text fw={500}>
            v{selectedVersionNumber} — {selectedCreatedAt}
          </Text>
          {versionQuery.isLoading && (
            <Skeleton h={400} data-testid="compare-left-skeleton" />
          )}
          {versionQuery.isError && (
            <Alert
              color="red"
              title="Failed to load version"
              data-testid="compare-left-error"
            >
              {versionQuery.error instanceof Error
                ? versionQuery.error.message
                : "Unknown error"}
            </Alert>
          )}
          {versionQuery.data && (
            <JsonInput
              value={JSON.stringify(versionQuery.data.config, null, 2)}
              readOnly
              autosize
              maxRows={40}
              formatOnBlur={false}
              data-testid="compare-left-json"
            />
          )}
        </Stack>
        <Stack gap="xs" data-testid="compare-right-column">
          <Text fw={500}>
            head (v{headWorkflow.version} — {headWorkflow.createdAt})
          </Text>
          <JsonInput
            value={headConfigJson}
            readOnly
            autosize
            maxRows={40}
            formatOnBlur={false}
            data-testid="compare-right-json"
          />
        </Stack>
      </SimpleGrid>
    </Modal>
  );
}
