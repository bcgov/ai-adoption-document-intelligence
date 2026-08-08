import {
  IconEdit,
  IconFlask,
  IconPlus,
  IconTemplate,
  IconTrash,
} from "@tabler/icons-react";
import { type ReactNode, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SlugChip } from "../components/workflow/SlugChip";
import {
  useDeleteWorkflow,
  useWorkflowDeleteImpact,
  useWorkflows,
} from "../data/hooks/useWorkflows";
import type { WorkflowTemplate } from "../features/workflow-builder/templates";
import { TemplatesPickerModal } from "../features/workflow-builder/templates/TemplatesPickerModal";
import {
  Anchor,
  Badge,
  Button,
  ConfirmActionModal,
  DataTable,
  Group,
  IconActionButton,
  notifications,
  PageHeader,
  PanelCard,
  SegmentedControl,
  Stack,
  Switch,
  Text,
} from "../ui";

type KindTab = "workflow" | "library" | "all";

const WORKFLOWS_DESCRIPTION =
  "Create and manage custom OCR processing workflows";

export function WorkflowListPage() {
  const navigate = useNavigate();
  const [showBenchmarkCandidates, setShowBenchmarkCandidates] = useState(false);
  const [kindTab, setKindTab] = useState<KindTab>("workflow");
  const {
    data: workflows,
    isLoading,
    error,
  } = useWorkflows({
    includeBenchmarkCandidates: showBenchmarkCandidates,
    // "workflow" matches the legacy default — passing undefined keeps the
    // backend's current behavior (primary lineages, libraries excluded).
    kind: kindTab === "workflow" ? undefined : kindTab,
  });
  const deleteWorkflowMutation = useDeleteWorkflow();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [workflowToDelete, setWorkflowToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  /**
   * G-050 — deleting a lineage cascades to every version under it, and each
   * document pinned to one of those versions loses the link recording which
   * graph produced it. "This action cannot be undone" was true but said
   * nothing about what would be undone; the counts do.
   */
  const { data: deleteImpact } = useWorkflowDeleteImpact(
    deleteModalOpen ? (workflowToDelete?.id ?? null) : null,
  );
  const deleteMessage = [
    `Are you sure you want to delete workflow "${workflowToDelete?.name}"? This action cannot be undone.`,
    deleteImpact
      ? describeDeleteImpact(
          deleteImpact.versionCount,
          deleteImpact.documentCount,
        )
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const handleTemplateSelect = (template: WorkflowTemplate) => {
    setTemplatesOpen(false);
    navigate("/workflows/create", { state: { template } });
  };

  const handleDeleteClick = (workflowId: string, workflowName: string) => {
    setWorkflowToDelete({ id: workflowId, name: workflowName });
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!workflowToDelete) return;

    try {
      await deleteWorkflowMutation.mutateAsync(workflowToDelete.id);
      notifications.show({
        title: "Success",
        message: `Workflow "${workflowToDelete.name}" deleted successfully`,
        color: "green",
      });
      setDeleteModalOpen(false);
      setWorkflowToDelete(null);
    } catch (error) {
      notifications.show({
        title: "Error",
        message:
          error instanceof Error ? error.message : "Failed to delete workflow",
        color: "red",
      });
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setWorkflowToDelete(null);
  };

  const listActions = (
    <Group gap="md" align="center" wrap="wrap">
      <SegmentedControl
        value={kindTab}
        onChange={(v) => setKindTab(v as KindTab)}
        data={[
          { label: "Workflows", value: "workflow" },
          { label: "Libraries", value: "library" },
          { label: "All", value: "all" },
        ]}
        size="xs"
        data-testid="workflow-kind-filter"
      />
      {workflows && workflows.length > 0 ? (
        <Switch
          checked={showBenchmarkCandidates}
          onChange={(e) => setShowBenchmarkCandidates(e.currentTarget.checked)}
          label="Show benchmark candidates"
        />
      ) : null}
      <Button
        variant="light"
        leftSection={<IconTemplate size={16} />}
        onClick={() => setTemplatesOpen(true)}
      >
        New from template
      </Button>
      <Button
        leftSection={<IconPlus size={16} />}
        onClick={() => navigate("/workflows/create")}
      >
        Create workflow
      </Button>
    </Group>
  );

  const emptyStateMessage =
    kindTab === "library"
      ? {
          title: "No library workflows yet",
          body: "Use 'Save as library' in the visual editor to create one.",
        }
      : {
          title: "No workflows yet",
          body: "Create your first workflow to customize OCR processing steps and parameters.",
        };

  let main: ReactNode;
  if (isLoading) {
    main = (
      <Stack gap="lg">
        <PageHeader
          title="Workflows"
          description={WORKFLOWS_DESCRIPTION}
          actions={listActions}
        />
        <Text c="dimmed">Loading workflows...</Text>
      </Stack>
    );
  } else if (error) {
    main = (
      <Stack gap="lg">
        <PageHeader
          title="Workflows"
          description={WORKFLOWS_DESCRIPTION}
          actions={listActions}
        />
        <Text c="red">
          {error instanceof Error ? error.message : "failed to load workflows"}
        </Text>
      </Stack>
    );
  } else if (!workflows || workflows.length === 0) {
    main = (
      <Stack gap="lg">
        <PageHeader
          title="Workflows"
          description={WORKFLOWS_DESCRIPTION}
          actions={listActions}
        />

        <PanelCard p="xl">
          <Stack align="center" gap="md">
            <IconFlask
              size={48}
              stroke={1.5}
              color="var(--mantine-color-gray-5)"
            />
            <Stack gap={4} align="center">
              <Text fw={500} size="lg">
                {emptyStateMessage.title}
              </Text>
              <Text c="dimmed" size="sm" ta="center">
                {emptyStateMessage.body}
              </Text>
            </Stack>
            {kindTab !== "library" && (
              <Group gap="xs" mt="md">
                <Button
                  variant="light"
                  leftSection={<IconTemplate size={16} />}
                  onClick={() => setTemplatesOpen(true)}
                >
                  Start from a template
                </Button>
                <Button
                  leftSection={<IconPlus size={16} />}
                  onClick={() => navigate("/workflows/create")}
                >
                  Create Your First Workflow
                </Button>
              </Group>
            )}
          </Stack>
        </PanelCard>
      </Stack>
    );
  } else {
    main = (
      <Stack gap="lg">
        <PageHeader
          title="Workflows"
          description={WORKFLOWS_DESCRIPTION}
          actions={listActions}
        />

        <PanelCard>
          {/* S-2 — `table-layout: fixed`, which is what makes the column
              widths below MEAN anything. Under the browser default (`auto`) a
              percentage is only a hint and content wins, and the widest
              content here is the slug: `SlugChip` renders it `nowrap`, so its
              max-content width is the whole token. Measured in the browser
              with 28 seeded workflows, that gave the slug column 495px against
              Name's 154px — the reported symptom, and the reason bumping the
              percentages alone changed nothing. Fixed layout also means an
              unsized column takes whatever the sized ones leave — used
              deliberately below, for Name and nothing else. */}
          <DataTable
            striped
            highlightOnHover
            layout="fixed"
            miw={930}
            caption={`${workflows.length} workflow${workflows.length === 1 ? "" : "s"}`}
          >
            <DataTable.Thead>
              <DataTable.Tr>
                {/* The actions column is the one column whose contents cannot
                    shrink: two BC DS icon buttons, 52px each, a 4px gap and
                    16px of cell padding either side — 140px, measured, not
                    guessed. Expressed as a percentage it was 4% (39px at a
                    1280px viewport), so the delete button hung 85px past the
                    row and the wrapper grew a horizontal scrollbar. It is
                    therefore FIXED in pixels: a percentage of a width nobody
                    controls cannot promise room for a button that never
                    changes size.

                    Name carries no width at all, on purpose. Under
                    `table-layout: fixed` the single unsized column absorbs
                    whatever the sized ones leave, so Name stays the widest
                    column and every extra pixel of viewport goes to the column
                    people actually scan — and the sized widths can never sum
                    past the table.

                    That remainder needs a floor, and it has to sit on the
                    TABLE, not on the Name cell: under fixed layout a cell's
                    `min-width` is ignored — only `width` counts — so a `miw`
                    on the header measured as a no-op, Name still collapsing to
                    40px at a 1024px viewport. `miw` on the table is the same
                    floor expressed where the layout algorithm reads it. 930 is
                    derived, not chosen: 496px of pixel columns plus 25% of the
                    table for Slug and Description leaves Name 0.75W − 496,
                    which reaches 200px at W = 928. Below that the table
                    outgrows its wrapper and the wrapper's existing
                    `overflow-x: auto` scrolls. A scrollbar on a genuinely
                    small window is the honest outcome; the reported bug was a
                    scrollbar at full desktop width.

                    Version, Schema, Created and Updated are pixels for the same
                    reason as the actions column: their content is a fixed size
                    that a wider window does not improve. Measured widest
                    contents are 47px (version badge), 51px (schema badge) and
                    58px (a date), and each header label is 52–60px; the widths
                    below are those plus the 32px of cell padding. As
                    percentages they simply ate space at large viewports.

                    Slug and Description stay percentages because they are the
                    two columns where extra width shows more: the slug is one
                    unbreakable token that truncates on a single line (the full
                    value is in the hover title and the copy button beside it),
                    and the description is clamped to two lines below. */}
                <DataTable.Th>Name</DataTable.Th>
                <DataTable.Th w="12%">Slug</DataTable.Th>
                <DataTable.Th w="13%">Description</DataTable.Th>
                <DataTable.Th w={84}>Version</DataTable.Th>
                <DataTable.Th w={88}>Schema</DataTable.Th>
                <DataTable.Th w={92}>Created</DataTable.Th>
                <DataTable.Th w={92}>Updated</DataTable.Th>
                <DataTable.Th w={140} />
              </DataTable.Tr>
            </DataTable.Thead>
            <DataTable.Tbody>
              {workflows.map((workflow) => (
                <DataTable.Tr key={workflow.id}>
                  <DataTable.Td>
                    {/* S-2 — heavier than the surrounding cells so the eye
                        lands here first when scanning the table. */}
                    <Anchor
                      component={Link}
                      to={`/workflows/${workflow.id}/edit`}
                      fw={600}
                      underline="hover"
                      data-testid="workflow-name-link"
                    >
                      {workflow.name}
                    </Anchor>
                  </DataTable.Td>
                  <DataTable.Td>
                    <SlugChip slug={workflow.slug} />
                  </DataTable.Td>
                  <DataTable.Td>
                    <Text
                      c="dimmed"
                      size="sm"
                      lineClamp={2}
                      data-testid="workflow-description"
                    >
                      {workflow.description || "—"}
                    </Text>
                  </DataTable.Td>
                  <DataTable.Td>
                    <Badge variant="light" color="blue">
                      v{workflow.version}
                    </Badge>
                  </DataTable.Td>
                  <DataTable.Td>
                    <Badge variant="light" color="gray">
                      {workflow.config.schemaVersion}
                    </Badge>
                  </DataTable.Td>
                  <DataTable.Td>
                    <Text size="sm" c="dimmed">
                      {new Date(workflow.createdAt).toLocaleDateString()}
                    </Text>
                  </DataTable.Td>
                  <DataTable.Td>
                    <Text size="sm" c="dimmed">
                      {new Date(workflow.updatedAt).toLocaleDateString()}
                    </Text>
                  </DataTable.Td>
                  <DataTable.Td>
                    <Group gap="xs" wrap="nowrap">
                      <IconActionButton
                        tooltip="Edit workflow"
                        variant="light"
                        color="blue"
                        onClick={() =>
                          navigate(`/workflows/${workflow.id}/edit`)
                        }
                        icon={<IconEdit size={18} />}
                      />
                      <IconActionButton
                        tooltip="Delete workflow"
                        variant="light"
                        color="red"
                        onClick={() =>
                          handleDeleteClick(workflow.id, workflow.name)
                        }
                        loading={
                          deleteWorkflowMutation.isPending &&
                          workflowToDelete?.id === workflow.id
                        }
                        icon={<IconTrash size={18} />}
                      />
                    </Group>
                  </DataTable.Td>
                </DataTable.Tr>
              ))}
            </DataTable.Tbody>
          </DataTable>
        </PanelCard>
      </Stack>
    );
  }

  return (
    <>
      {main}
      <TemplatesPickerModal
        opened={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onSelect={handleTemplateSelect}
      />
      <ConfirmActionModal
        opened={deleteModalOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete workflow"
        message={deleteMessage}
        confirmLabel="Delete"
        confirmLoading={deleteWorkflowMutation.isPending}
      />
    </>
  );
}

/**
 * G-050 — one sentence naming what the cascade takes. Documents are NOT
 * deleted; only the link recording which graph produced them, which is the
 * part that is destroyed silently and cannot be reconstructed afterwards.
 */
export function describeDeleteImpact(
  versionCount: number,
  documentCount: number,
): string {
  const versions =
    versionCount === 1 ? "1 saved version" : `${versionCount} saved versions`;
  if (documentCount === 0) {
    return `${versions} will be deleted. No documents reference them.`;
  }
  return documentCount === 1
    ? `${versions} will be deleted. 1 document processed by this workflow keeps its data, but loses the record of which version produced it.`
    : `${versions} will be deleted. ${documentCount} documents processed by this workflow keep their data, but lose the record of which version produced them.`;
}
