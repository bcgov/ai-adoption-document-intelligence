import {
  Badge,
  Card,
  Code,
  Group,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconAlertCircle, IconCheck, IconX } from "@tabler/icons-react";
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
        <Table striped highlightOnHover data-testid="issue-summary-table">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Category</Table.Th>
              <Table.Th>Count</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr data-testid="schema-violations-row">
              <Table.Td>Schema Violations</Table.Td>
              <Table.Td>
                <Badge
                  color={
                    validation.issueCount.schemaViolations > 0 ? "red" : "gray"
                  }
                  data-testid="schema-violations-count"
                >
                  {validation.issueCount.schemaViolations}
                </Badge>
              </Table.Td>
            </Table.Tr>
            <Table.Tr data-testid="missing-ground-truth-row">
              <Table.Td>Missing Ground Truth</Table.Td>
              <Table.Td>
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
              </Table.Td>
            </Table.Tr>
            <Table.Tr data-testid="duplicates-row">
              <Table.Td>Duplicates</Table.Td>
              <Table.Td>
                <Badge
                  color={
                    validation.issueCount.duplicates > 0 ? "yellow" : "gray"
                  }
                  data-testid="duplicates-count"
                >
                  {validation.issueCount.duplicates}
                </Badge>
              </Table.Td>
            </Table.Tr>
            <Table.Tr data-testid="corruption-row">
              <Table.Td>File Corruption</Table.Td>
              <Table.Td>
                <Badge
                  color={validation.issueCount.corruption > 0 ? "red" : "gray"}
                  data-testid="corruption-count"
                >
                  {validation.issueCount.corruption}
                </Badge>
              </Table.Td>
            </Table.Tr>
            <Table.Tr data-testid="total-issues-row">
              <Table.Td>
                <strong>Total Issues</strong>
              </Table.Td>
              <Table.Td>
                <Badge
                  color={totalIssues > 0 ? "red" : "green"}
                  data-testid="total-issues-count"
                >
                  {totalIssues}
                </Badge>
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
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
