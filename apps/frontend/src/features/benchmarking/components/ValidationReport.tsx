import { IconAlertCircle, IconCheck, IconX } from "@tabler/icons-react";
import {
  Badge,
  Card,
  Code,
  DataTable,
  Group,
  Stack,
  Text,
  Title,
} from "../../../ui";
import type { ValidationResponse } from "../hooks/useDatasetValidation";

interface ValidationReportProps {
  validation: ValidationResponse;
}

export function ValidationReport({ validation }: ValidationReportProps) {
  const totalIssues =
    validation.issueCount.schemaViolations +
    validation.issueCount.missingGroundTruth +
    validation.issueCount.duplicates +
    validation.issueCount.corruption;

  return (
    <Stack gap="md">
      {/* Overall Status */}
      <Card padding="lg" withBorder data-testid="validation-status-card">
        <Group justify="space-between">
          <div>
            <Title order={4} data-testid="validation-result-title">
              Validation Result
            </Title>
            {validation.sampled && (
              <Text size="sm" c="dimmed" data-testid="validation-sample-info">
                Sampled {validation.sampleSize} of {validation.totalSamples}{" "}
                samples
              </Text>
            )}
          </div>
          <Badge
            size="lg"
            color={validation.valid ? "green" : "red"}
            leftSection={
              validation.valid ? <IconCheck size={16} /> : <IconX size={16} />
            }
            data-testid="validation-status-badge"
          >
            {validation.valid ? "Valid" : "Invalid"}
          </Badge>
        </Group>
      </Card>

      {/* Issue Summary */}
      <Card padding="lg" withBorder data-testid="validation-issue-summary-card">
        <Title order={5} mb="md" data-testid="issue-summary-title">
          Issue Summary
        </Title>
        <DataTable striped highlightOnHover data-testid="issue-summary-table">
          <DataTable.Thead>
            <DataTable.Tr>
              <DataTable.Th>Category</DataTable.Th>
              <DataTable.Th>Count</DataTable.Th>
            </DataTable.Tr>
          </DataTable.Thead>
          <DataTable.Tbody>
            <DataTable.Tr data-testid="schema-violations-row">
              <DataTable.Td>Schema Violations</DataTable.Td>
              <DataTable.Td>
                <Badge
                  color={
                    validation.issueCount.schemaViolations > 0 ? "red" : "gray"
                  }
                  data-testid="schema-violations-count"
                >
                  {validation.issueCount.schemaViolations}
                </Badge>
              </DataTable.Td>
            </DataTable.Tr>
            <DataTable.Tr data-testid="missing-ground-truth-row">
              <DataTable.Td>Missing Ground Truth</DataTable.Td>
              <DataTable.Td>
                <Badge
                  color={
                    validation.issueCount.missingGroundTruth > 0
                      ? "red"
                      : "gray"
                  }
                  data-testid="missing-ground-truth-count"
                >
                  {validation.issueCount.missingGroundTruth}
                </Badge>
              </DataTable.Td>
            </DataTable.Tr>
            <DataTable.Tr data-testid="duplicates-row">
              <DataTable.Td>Duplicates</DataTable.Td>
              <DataTable.Td>
                <Badge
                  color={
                    validation.issueCount.duplicates > 0 ? "yellow" : "gray"
                  }
                  data-testid="duplicates-count"
                >
                  {validation.issueCount.duplicates}
                </Badge>
              </DataTable.Td>
            </DataTable.Tr>
            <DataTable.Tr data-testid="corruption-row">
              <DataTable.Td>File Corruption</DataTable.Td>
              <DataTable.Td>
                <Badge
                  color={validation.issueCount.corruption > 0 ? "red" : "gray"}
                  data-testid="corruption-count"
                >
                  {validation.issueCount.corruption}
                </Badge>
              </DataTable.Td>
            </DataTable.Tr>
            <DataTable.Tr data-testid="total-issues-row">
              <DataTable.Td>
                <strong>Total Issues</strong>
              </DataTable.Td>
              <DataTable.Td>
                <Badge
                  color={totalIssues > 0 ? "red" : "green"}
                  data-testid="total-issues-count"
                >
                  {totalIssues}
                </Badge>
              </DataTable.Td>
            </DataTable.Tr>
          </DataTable.Tbody>
        </DataTable>
      </Card>

      {/* Detailed Issues */}
      {validation.issues.length > 0 && (
        <Card
          padding="lg"
          withBorder
          data-testid="validation-detailed-issues-card"
        >
          <Title order={5} mb="md" data-testid="detailed-issues-title">
            Detailed Issues
          </Title>
          <Stack gap="sm" data-testid="issues-list">
            {validation.issues.map((issue, index) => (
              <Card
                key={index}
                padding="md"
                withBorder
                data-testid={`issue-card-${index}`}
              >
                <Group justify="space-between" mb="xs">
                  <Group gap="xs">
                    <IconAlertCircle
                      size={20}
                      color={issue.severity === "error" ? "red" : "orange"}
                    />
                    <Text fw={500} data-testid={`issue-sample-id-${index}`}>
                      {issue.sampleId}
                    </Text>
                    <Badge
                      size="sm"
                      color={getCategoryColor(issue.category)}
                      data-testid={`issue-category-${index}`}
                    >
                      {formatCategory(issue.category)}
                    </Badge>
                  </Group>
                  <Badge
                    size="sm"
                    color={issue.severity === "error" ? "red" : "yellow"}
                    data-testid={`issue-severity-${index}`}
                  >
                    {issue.severity}
                  </Badge>
                </Group>
                <Text size="sm" mb="xs" data-testid={`issue-message-${index}`}>
                  {issue.message}
                </Text>
                {issue.filePath && (
                  <Text
                    size="xs"
                    c="dimmed"
                    data-testid={`issue-file-path-${index}`}
                  >
                    File: <Code>{issue.filePath}</Code>
                  </Text>
                )}
                {issue.details && Object.keys(issue.details).length > 0 && (
                  <Code block mt="xs" data-testid={`issue-details-${index}`}>
                    {JSON.stringify(issue.details, null, 2)}
                  </Code>
                )}
              </Card>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

function getCategoryColor(
  category: ValidationResponse["issues"][0]["category"],
): string {
  switch (category) {
    case "schema_violation":
      return "red";
    case "missing_ground_truth":
      return "orange";
    case "duplicate":
      return "yellow";
    case "corruption":
      return "red";
    default:
      return "gray";
  }
}

function formatCategory(
  category: ValidationResponse["issues"][0]["category"],
): string {
  switch (category) {
    case "schema_violation":
      return "Schema Violation";
    case "missing_ground_truth":
      return "Missing Ground Truth";
    case "duplicate":
      return "Duplicate";
    case "corruption":
      return "Corruption";
    default:
      return category;
  }
}
