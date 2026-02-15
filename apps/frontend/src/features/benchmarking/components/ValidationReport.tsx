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
      <Card padding="lg" withBorder>
        <Group justify="space-between">
          <div>
            <Title order={4}>Validation Result</Title>
            {validation.sampled && (
              <Text size="sm" c="dimmed">
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
          >
            {validation.valid ? "Valid" : "Invalid"}
          </Badge>
        </Group>
      </Card>

      {/* Issue Summary */}
      <Card padding="lg" withBorder>
        <Title order={5} mb="md">
          Issue Summary
        </Title>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Category</Table.Th>
              <Table.Th>Count</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td>Schema Violations</Table.Td>
              <Table.Td>
                <Badge
                  color={
                    validation.issueCount.schemaViolations > 0 ? "red" : "gray"
                  }
                >
                  {validation.issueCount.schemaViolations}
                </Badge>
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Missing Ground Truth</Table.Td>
              <Table.Td>
                <Badge
                  color={
                    validation.issueCount.missingGroundTruth > 0
                      ? "red"
                      : "gray"
                  }
                >
                  {validation.issueCount.missingGroundTruth}
                </Badge>
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Duplicates</Table.Td>
              <Table.Td>
                <Badge
                  color={
                    validation.issueCount.duplicates > 0 ? "yellow" : "gray"
                  }
                >
                  {validation.issueCount.duplicates}
                </Badge>
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>File Corruption</Table.Td>
              <Table.Td>
                <Badge
                  color={validation.issueCount.corruption > 0 ? "red" : "gray"}
                >
                  {validation.issueCount.corruption}
                </Badge>
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>
                <strong>Total Issues</strong>
              </Table.Td>
              <Table.Td>
                <Badge color={totalIssues > 0 ? "red" : "green"}>
                  {totalIssues}
                </Badge>
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Card>

      {/* Detailed Issues */}
      {validation.issues.length > 0 && (
        <Card padding="lg" withBorder>
          <Title order={5} mb="md">
            Detailed Issues
          </Title>
          <Stack gap="sm">
            {validation.issues.map((issue, index) => (
              <Card key={index} padding="md" withBorder>
                <Group justify="space-between" mb="xs">
                  <Group gap="xs">
                    <IconAlertCircle
                      size={20}
                      color={issue.severity === "error" ? "red" : "orange"}
                    />
                    <Text fw={500}>{issue.sampleId}</Text>
                    <Badge size="sm" color={getCategoryColor(issue.category)}>
                      {formatCategory(issue.category)}
                    </Badge>
                  </Group>
                  <Badge
                    size="sm"
                    color={issue.severity === "error" ? "red" : "yellow"}
                  >
                    {issue.severity}
                  </Badge>
                </Group>
                <Text size="sm" mb="xs">
                  {issue.message}
                </Text>
                {issue.filePath && (
                  <Text size="xs" c="dimmed">
                    File: <Code>{issue.filePath}</Code>
                  </Text>
                )}
                {issue.details && Object.keys(issue.details).length > 0 && (
                  <Code block mt="xs">
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
