import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Code,
  Drawer,
  Grid,
  Group,
  JsonInput,
  Loader,
  Pagination,
  ScrollArea,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconChevronRight,
  IconFilter,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useProject } from "../hooks/useProjects";
import { usePerSampleResults, useRun } from "../hooks/useRuns";

/**
 * Drill-down panel component registry
 *
 * Allows workflow-specific visualization panels to be registered
 * without modifying the core drill-down framework.
 */
interface DrillDownPanelProps {
  sampleId: string;
  metadata: Record<string, unknown>;
  metrics: Record<string, number>;
  groundTruth?: unknown;
  prediction?: unknown;
  evaluationDetails?: unknown;
  diagnostics?: Record<string, unknown>;
}

type DrillDownPanelComponent = React.FC<DrillDownPanelProps>;

class DrillDownPanelRegistry {
  private panels: Map<string, DrillDownPanelComponent> = new Map();

  register(name: string, component: DrillDownPanelComponent) {
    this.panels.set(name, component);
  }

  get(name: string): DrillDownPanelComponent | undefined {
    return this.panels.get(name);
  }

  getAll(): Array<{ name: string; component: DrillDownPanelComponent }> {
    return Array.from(this.panels.entries()).map(([name, component]) => ({
      name,
      component,
    }));
  }
}

export const drillDownPanelRegistry = new DrillDownPanelRegistry();

/**
 * Default drill-down panel component
 */
const DefaultDrillDownPanel: DrillDownPanelComponent = ({
  sampleId,
  metadata,
  metrics,
  groundTruth,
  prediction,
  evaluationDetails,
  diagnostics,
}) => {
  return (
    <Stack gap="md">
      <Card withBorder>
        <Stack gap="xs">
          <Text fw={600} size="sm">
            Sample ID
          </Text>
          <Code>{sampleId}</Code>
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="xs">
          <Text fw={600} size="sm">
            Metadata
          </Text>
          <JsonInput
            value={JSON.stringify(metadata, null, 2)}
            readOnly
            autosize
            minRows={3}
            maxRows={10}
          />
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="xs">
          <Text fw={600} size="sm">
            Metrics
          </Text>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Metric</Table.Th>
                <Table.Th>Value</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {Object.entries(metrics).map(([key, value]) => (
                <Table.Tr key={key}>
                  <Table.Td>{key}</Table.Td>
                  <Table.Td>{typeof value === "number" ? value.toFixed(4) : value}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      </Card>

      {groundTruth !== undefined && (
        <Card withBorder>
          <Stack gap="xs">
            <Text fw={600} size="sm">
              Ground Truth
            </Text>
            <JsonInput
              value={(JSON.stringify(groundTruth, null, 2) || "{}") as string}
              readOnly
              autosize
              minRows={3}
              maxRows={15}
            />
          </Stack>
        </Card>
      )}

      {prediction !== undefined && (
        <Card withBorder>
          <Stack gap="xs">
            <Text fw={600} size="sm">
              Prediction
            </Text>
            <JsonInput
              value={(JSON.stringify(prediction, null, 2) || "{}") as string}
              readOnly
              autosize
              minRows={3}
              maxRows={15}
            />
          </Stack>
        </Card>
      )}

      {evaluationDetails !== undefined && (
        <Card withBorder>
          <Stack gap="xs">
            <Text fw={600} size="sm">
              Evaluation Details
            </Text>
            <JsonInput
              value={
                (JSON.stringify(evaluationDetails, null, 2) || "{}") as string
              }
              readOnly
              autosize
              minRows={3}
              maxRows={15}
            />
          </Stack>
        </Card>
      )}

      {diagnostics && (
        <Card withBorder>
          <Stack gap="xs">
            <Text fw={600} size="sm">
              Diagnostics
            </Text>
            <JsonInput
              value={JSON.stringify(diagnostics, null, 2)}
              readOnly
              autosize
              minRows={3}
              maxRows={10}
            />
          </Stack>
        </Card>
      )}
    </Stack>
  );
};

export default function ResultsDrillDownPage() {
  const { projectId, runId } = useParams<{
    projectId: string;
    runId: string;
  }>();
  const navigate = useNavigate();

  const { project } = useProject(projectId || "");
  const { run, isLoading: runLoading } = useRun(
    projectId || "",
    runId || "",
    false,
  );

  const [filters, setFilters] = useState<Record<string, string | number>>({});
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [selectedSample, setSelectedSample] = useState<{
    sampleId: string;
    metadata: Record<string, unknown>;
    metrics: Record<string, number>;
    groundTruth?: unknown;
    prediction?: unknown;
    evaluationDetails?: unknown;
    diagnostics?: Record<string, unknown>;
  } | null>(null);

  const {
    results,
    total,
    totalPages,
    availableDimensions,
    dimensionValues,
    isLoading,
    error,
  } = usePerSampleResults(projectId || "", runId || "", filters, page, limit);

  if (runLoading) {
    return (
      <Center h={400}>
        <Loader />
      </Center>
    );
  }

  if (!run) {
    return (
      <Alert
        color="red"
        title="Run Not Found"
        icon={<IconAlertCircle />}
        mt="md"
      >
        The requested benchmark run could not be found.
      </Alert>
    );
  }

  if (run.status !== "completed") {
    return (
      <Alert
        color="yellow"
        title="Results Not Available"
        icon={<IconAlertCircle />}
        mt="md"
      >
        Drill-down results are only available for completed runs. Current
        status: {run.status}
      </Alert>
    );
  }

  const handleFilterChange = (dimension: string, value: string | null) => {
    if (value === null || value === "") {
      const newFilters = { ...filters };
      delete newFilters[dimension];
      setFilters(newFilters);
    } else {
      // Try to parse as number
      const numValue = Number(value);
      setFilters({
        ...filters,
        [dimension]: isNaN(numValue) ? value : numValue,
      });
    }
    setPage(1); // Reset to page 1 when filters change
  };

  const clearFilters = () => {
    setFilters({});
    setPage(1);
  };

  const activeFilterCount = Object.keys(filters).length;

  // Get custom panels from registry
  const customPanels = drillDownPanelRegistry.getAll();

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Title order={2}>Sample Results: {run.definitionName}</Title>
          <Text size="sm" c="dimmed">
            {project?.name || projectId} • Run ID: {runId}
          </Text>
        </div>
        <Button
          variant="subtle"
          onClick={() =>
            navigate(
              `/benchmarking/projects/${projectId}/runs/${runId}`,
            )
          }
          data-testid="back-to-run-details-btn"
        >
          Back to Run Details
        </Button>
      </Group>

      {/* Filter Panel */}
      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Group gap="xs">
              <IconFilter size={20} />
              <Text fw={600}>Filters</Text>
              {activeFilterCount > 0 && (
                <Badge size="sm" circle data-testid="active-filter-count">
                  {activeFilterCount}
                </Badge>
              )}
            </Group>
            {activeFilterCount > 0 && (
              <Button
                variant="subtle"
                size="xs"
                leftSection={<IconX size={14} />}
                onClick={clearFilters}
                data-testid="clear-all-filters-btn"
              >
                Clear All
              </Button>
            )}
          </Group>

          {availableDimensions.length === 0 ? (
            <Text size="sm" c="dimmed">
              No filterable dimensions available
            </Text>
          ) : (
            <Grid>
              {availableDimensions.map((dimension) => (
                <Grid.Col key={dimension} span={{ base: 12, sm: 6, md: 4 }}>
                  <Select
                    label={dimension}
                    placeholder={`Select ${dimension}`}
                    data={dimensionValues[dimension]?.map((v) => ({
                      value: String(v),
                      label: String(v),
                    }))}
                    value={
                      filters[dimension] !== undefined
                        ? String(filters[dimension])
                        : null
                    }
                    onChange={(value) => handleFilterChange(dimension, value)}
                    clearable
                    data-testid={`filter-${dimension}`}
                  />
                </Grid.Col>
              ))}
            </Grid>
          )}
        </Stack>
      </Card>

      {/* Results Summary */}
      <Card withBorder>
        <Group justify="space-between">
          <Text size="sm" fw={500} data-testid="sample-count">
            Showing {results.length} of {total} samples
          </Text>
          {totalPages > 1 && (
            <Pagination
              total={totalPages}
              value={page}
              onChange={setPage}
              size="sm"
              data-testid="top-pagination"
            />
          )}
        </Group>
      </Card>

      {/* Results Table */}
      {isLoading ? (
        <Center h={200}>
          <Loader />
        </Center>
      ) : error ? (
        <Alert color="red" title="Error" icon={<IconAlertCircle />}>
          Failed to load results: {String(error)}
        </Alert>
      ) : results.length === 0 ? (
        <Alert
          color="blue"
          title="No Results"
          icon={<IconAlertCircle />}
          data-testid="empty-results-alert"
        >
          No samples match the selected filters.
        </Alert>
      ) : (
        <Card withBorder>
          <ScrollArea>
            <Table striped highlightOnHover data-testid="samples-table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Sample ID</Table.Th>
                  {availableDimensions.slice(0, 3).map((dim) => (
                    <Table.Th key={dim}>{dim}</Table.Th>
                  ))}
                  <Table.Th>Metrics</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {results.map((result) => (
                  <Table.Tr key={result.sampleId}>
                    <Table.Td>
                      <Code>{result.sampleId}</Code>
                    </Table.Td>
                    {availableDimensions.slice(0, 3).map((dim) => (
                      <Table.Td key={dim}>
                        {result.metadata[dim] !== undefined
                          ? String(result.metadata[dim])
                          : "-"}
                      </Table.Td>
                    ))}
                    <Table.Td>
                      <Group gap={4}>
                        {Object.entries(result.metrics)
                          .slice(0, 2)
                          .map(([key, value]) => (
                            <Badge key={key} size="sm" variant="light">
                              {key}: {value.toFixed(3)}
                            </Badge>
                          ))}
                        {Object.keys(result.metrics).length > 2 && (
                          <Badge size="sm" variant="light" color="gray">
                            +{Object.keys(result.metrics).length - 2} more
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <ActionIcon
                        variant="subtle"
                        onClick={() => setSelectedSample(result)}
                        data-testid={`view-sample-${result.sampleId}`}
                      >
                        <IconChevronRight size={16} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Card>
      )}

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <Group justify="center">
          <Pagination
            total={totalPages}
            value={page}
            onChange={setPage}
            data-testid="bottom-pagination"
          />
        </Group>
      )}

      {/* Sample Detail Drawer */}
      <Drawer
        opened={selectedSample !== null}
        onClose={() => setSelectedSample(null)}
        position="right"
        size="xl"
        title={
          <Text fw={600}>
            Sample Details: {selectedSample?.sampleId || ""}
          </Text>
        }
        data-testid="sample-detail-drawer"
      >
        {selectedSample && (
          <ScrollArea h="calc(100vh - 80px)">
            {customPanels.length > 0 ? (
              <Tabs defaultValue="default">
                <Tabs.List>
                  <Tabs.Tab value="default">Default View</Tabs.Tab>
                  {customPanels.map(({ name }) => (
                    <Tabs.Tab key={name} value={name}>
                      {name}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>

                <Box pt="md">
                  <Tabs.Panel value="default">
                    <DefaultDrillDownPanel {...selectedSample} />
                  </Tabs.Panel>
                  {customPanels.map(({ name, component: Component }) => (
                    <Tabs.Panel key={name} value={name}>
                      <Component {...selectedSample} />
                    </Tabs.Panel>
                  ))}
                </Box>
              </Tabs>
            ) : (
              <DefaultDrillDownPanel {...selectedSample} />
            )}
          </ScrollArea>
        )}
      </Drawer>
    </Stack>
  );
}
