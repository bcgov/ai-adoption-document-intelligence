import {
  IconAlertCircle,
  IconArrowLeft,
  IconCheck,
  IconChevronRight,
  IconFilter,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Code,
  DataTable,
  Drawer,
  Grid,
  Group,
  JsonInput,
  Loader,
  Pagination,
  PanelCard,
  ScrollArea,
  Select,
  Stack,
  Tabs,
  Text,
  Title,
} from "../../../ui";
import { useProject } from "../hooks/useProjects";
import { usePerSampleResults, useRun } from "../hooks/useRuns";
import {
  type DrillDownPanelComponent,
  drillDownPanelRegistry,
} from "../registry/drillDownPanelRegistry";

/**
 * Default drill-down panel component
 */
const DefaultDrillDownPanel: DrillDownPanelComponent = ({
  sampleId,
  metadata,
  metrics,
  pass,
  groundTruth,
  prediction,
  evaluationDetails,
  diagnostics,
}) => {
  return (
    <Stack gap="md">
      <PanelCard>
        <Group justify="space-between">
          <Stack gap="xs">
            <Text fw={600} size="sm">
              Sample ID
            </Text>
            <Code>{sampleId}</Code>
          </Stack>
          <Badge
            size="lg"
            color={pass ? "green" : "red"}
            leftSection={pass ? <IconCheck size={14} /> : <IconX size={14} />}
          >
            {pass ? "PASS" : "FAIL"}
          </Badge>
        </Group>
      </PanelCard>

      <PanelCard>
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
      </PanelCard>

      <PanelCard>
        <Stack gap="xs">
          <Text fw={600} size="sm">
            Metrics
          </Text>
          <DataTable>
            <DataTable.Thead>
              <DataTable.Tr>
                <DataTable.Th>Metric</DataTable.Th>
                <DataTable.Th>Value</DataTable.Th>
              </DataTable.Tr>
            </DataTable.Thead>
            <DataTable.Tbody>
              {Object.entries(metrics).map(([key, value]) => (
                <DataTable.Tr key={key}>
                  <DataTable.Td>{key}</DataTable.Td>
                  <DataTable.Td>
                    {typeof value === "number" ? value.toFixed(4) : value}
                  </DataTable.Td>
                </DataTable.Tr>
              ))}
            </DataTable.Tbody>
          </DataTable>
        </Stack>
      </PanelCard>

      <PanelCard>
        <Stack gap="xs">
          <Text fw={600} size="sm">
            Expected vs actual
          </Text>
          {groundTruth === undefined && prediction === undefined ? (
            <Text size="sm" c="dimmed">
              Expected and actual data is not available for this sample. This
              data will be available for runs started after this update.
            </Text>
          ) : (
            <Grid>
              <Grid.Col span={6}>
                <Text size="xs" fw={500} c="dimmed" mb={4}>
                  Ground truth (expected)
                </Text>
                <JsonInput
                  value={
                    groundTruth !== undefined
                      ? ((JSON.stringify(groundTruth, null, 2) ||
                          "{}") as string)
                      : "N/A"
                  }
                  readOnly
                  autosize
                  minRows={3}
                  maxRows={20}
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <Text size="xs" fw={500} c="dimmed" mb={4}>
                  Prediction (actual)
                </Text>
                <JsonInput
                  value={
                    prediction !== undefined
                      ? ((JSON.stringify(prediction, null, 2) ||
                          "{}") as string)
                      : "N/A"
                  }
                  readOnly
                  autosize
                  minRows={3}
                  maxRows={20}
                />
              </Grid.Col>
            </Grid>
          )}
        </Stack>
      </PanelCard>

      {evaluationDetails !== undefined && (
        <PanelCard>
          <Stack gap="xs">
            <Text fw={600} size="sm">
              Evaluation details
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
        </PanelCard>
      )}

      {diagnostics && (
        <PanelCard>
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
        </PanelCard>
      )}
    </Stack>
  );
};

export function ResultsDrillDownPage() {
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
    pass: boolean;
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
        title="Run not found"
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
        title="Results not available"
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
        [dimension]: Number.isNaN(numValue) ? value : numValue,
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
        <Group gap="md">
          <Button
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() =>
              navigate(`/benchmarking/projects/${projectId}/runs/${runId}`)
            }
            data-testid="back-to-run-details-btn"
          >
            Back to run details
          </Button>
          <div>
            <Title order={2}>Sample results: {run.definitionName}</Title>
            <Text size="sm" c="dimmed">
              {project?.name || projectId} • run ID: {runId}
            </Text>
          </div>
        </Group>
      </Group>

      {/* Filter panel */}
      <PanelCard>
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
                Clear all
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
      </PanelCard>

      {/* Results summary */}
      <PanelCard>
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
      </PanelCard>

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
          title="No results"
          icon={<IconAlertCircle />}
          data-testid="empty-results-alert"
        >
          No samples match the selected filters.
        </Alert>
      ) : (
        <PanelCard>
          <ScrollArea>
            <DataTable striped highlightOnHover data-testid="samples-table">
              <DataTable.Thead>
                <DataTable.Tr>
                  <DataTable.Th>Sample ID</DataTable.Th>
                  <DataTable.Th>Status</DataTable.Th>
                  {availableDimensions
                    .filter((d) => d !== "pass")
                    .slice(0, 3)
                    .map((dim) => (
                      <DataTable.Th key={dim}>{dim}</DataTable.Th>
                    ))}
                  <DataTable.Th>Metrics</DataTable.Th>
                  <DataTable.Th>Actions</DataTable.Th>
                </DataTable.Tr>
              </DataTable.Thead>
              <DataTable.Tbody>
                {results.map((result) => (
                  <DataTable.Tr key={result.sampleId}>
                    <DataTable.Td>
                      <Code>{result.sampleId}</Code>
                    </DataTable.Td>
                    <DataTable.Td>
                      <Badge
                        color={result.pass ? "green" : "red"}
                        leftSection={
                          result.pass ? (
                            <IconCheck size={12} />
                          ) : (
                            <IconX size={12} />
                          )
                        }
                      >
                        {result.pass ? "PASS" : "FAIL"}
                      </Badge>
                    </DataTable.Td>
                    {availableDimensions
                      .filter((d) => d !== "pass")
                      .slice(0, 3)
                      .map((dim) => (
                        <DataTable.Td key={dim}>
                          {result.metadata[dim] !== undefined
                            ? String(result.metadata[dim])
                            : "-"}
                        </DataTable.Td>
                      ))}
                    <DataTable.Td>
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
                    </DataTable.Td>
                    <DataTable.Td
                      onClick={() => setSelectedSample(result)}
                      data-testid={`view-sample-${result.sampleId}`}
                      style={{ cursor: "pointer" }}
                    >
                      <ActionIcon variant="subtle">
                        <IconChevronRight size={16} />
                      </ActionIcon>
                    </DataTable.Td>
                  </DataTable.Tr>
                ))}
              </DataTable.Tbody>
            </DataTable>
          </ScrollArea>
        </PanelCard>
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
          <Text fw={600}>Sample details: {selectedSample?.sampleId || ""}</Text>
        }
        data-testid="sample-detail-drawer"
      >
        {selectedSample && (
          <ScrollArea h="calc(100vh - 80px)">
            {customPanels.length > 0 ? (
              <Tabs defaultValue="default">
                <Tabs.List>
                  <Tabs.Tab value="default">Default view</Tabs.Tab>
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
