/**
 * Run-this-workflow drawer (Phase 2 Track 2 — US-071, US-072).
 *
 * Right-side Mantine Drawer that documents how to trigger the workflow
 * from outside (URL + input schema + sample curl + auth notes) and
 * lets the author paste a JSON body and start a real Temporal
 * execution directly from the editor.
 */

import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Code,
  CopyButton,
  Drawer,
  Group,
  JsonInput,
  Loader,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconCopy, IconPlayerPlay } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import {
  type RunSpecInputSchema,
  useStartWorkflowRun,
  useWorkflowRunSpec,
} from "../../../data/hooks/useWorkflows";
import { buildStubInput } from "./build-stub-input";

interface RunWorkflowDrawerProps {
  opened: boolean;
  onClose: () => void;
  workflowId: string;
}

export function RunWorkflowDrawer({
  opened,
  onClose,
  workflowId,
}: RunWorkflowDrawerProps) {
  const runSpecQuery = useWorkflowRunSpec(opened ? workflowId : undefined);
  const startRun = useStartWorkflowRun();

  const [pasteBody, setPasteBody] = useState<string>("");
  const [lastWorkflowId, setLastWorkflowId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Prefill the JsonInput whenever the schema changes (i.e. when the
  // drawer opens for a workflow with a fresh schema).
  useEffect(() => {
    if (!runSpecQuery.data) return;
    const stub = buildStubInput(runSpecQuery.data.inputSchema);
    setPasteBody(JSON.stringify(stub, null, 2));
    setLastWorkflowId(null);
    setRunError(null);
  }, [runSpecQuery.data]);

  const parseError = useMemo(() => {
    if (!pasteBody.trim()) return null;
    try {
      const parsed = JSON.parse(pasteBody);
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        return "Body must be a JSON object";
      }
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Invalid JSON";
    }
  }, [pasteBody]);

  const handleRun = async () => {
    if (parseError !== null) return;
    setRunError(null);
    try {
      const initialCtx = pasteBody.trim()
        ? (JSON.parse(pasteBody) as Record<string, unknown>)
        : {};
      const result = await startRun.mutateAsync({
        workflowId,
        body: { initialCtx },
      });
      setLastWorkflowId(result.workflowId);
      notifications.show({
        title: "Workflow run started",
        message: result.workflowId,
        color: "green",
      });
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={520}
      title={<Title order={4}>Run this workflow</Title>}
      padding="md"
    >
      {runSpecQuery.isLoading && (
        <Stack align="center" mt="xl">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Loading run-spec…
          </Text>
        </Stack>
      )}

      {runSpecQuery.isError && (
        <Alert color="red" title="Failed to load run-spec">
          {runSpecQuery.error instanceof Error
            ? runSpecQuery.error.message
            : "Unknown error"}
        </Alert>
      )}

      {runSpecQuery.data && (
        <Stack gap="lg">
          <Section title="Trigger URL">
            <UrlCopyBlock value={runSpecQuery.data.triggerUrl} />
          </Section>

          <Section title="Input schema">
            <InputSchemaList schema={runSpecQuery.data.inputSchema} />
          </Section>

          <Section title="Sample curl">
            <CurlCopyBlock value={runSpecQuery.data.sampleCurl} />
          </Section>

          <Section title="Authentication">
            <Text size="sm">{runSpecQuery.data.authNotes}</Text>
          </Section>

          <Section title="Test run">
            <Stack gap="xs">
              <JsonInput
                value={pasteBody}
                onChange={setPasteBody}
                minRows={6}
                autosize
                formatOnBlur
                placeholder='{"customerId": "..."}'
                aria-label="Initial ctx JSON for the test run"
                error={parseError ?? undefined}
              />
              <Group justify="flex-end">
                <Button
                  leftSection={<IconPlayerPlay size={14} />}
                  onClick={handleRun}
                  disabled={parseError !== null}
                  loading={startRun.isPending}
                  data-testid="run-workflow-button"
                >
                  Run
                </Button>
              </Group>
              {lastWorkflowId && (
                <Alert color="green" title="Workflow run started">
                  <Group gap="xs" wrap="nowrap" align="center">
                    <Code style={{ wordBreak: "break-all", flex: 1 }}>
                      {lastWorkflowId}
                    </Code>
                    <CopyButton value={lastWorkflowId}>
                      {({ copied, copy }) => (
                        <Tooltip
                          label={copied ? "Copied" : "Copy workflow id"}
                          withArrow
                        >
                          <ActionIcon
                            variant="subtle"
                            onClick={copy}
                            aria-label="Copy workflow id"
                          >
                            {copied ? (
                              <IconCheck size={14} />
                            ) : (
                              <IconCopy size={14} />
                            )}
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </CopyButton>
                  </Group>
                </Alert>
              )}
              {runError && (
                <Alert color="red" title="Run failed">
                  {runError}
                </Alert>
              )}
            </Stack>
          </Section>
        </Stack>
      )}
    </Drawer>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box>
      <Text fw={600} size="sm" mb="xs">
        {title}
      </Text>
      {children}
    </Box>
  );
}

function UrlCopyBlock({ value }: { value: string }) {
  return (
    <Group gap="xs" wrap="nowrap" align="center">
      <Code style={{ wordBreak: "break-all", flex: 1 }}>{value}</Code>
      <CopyButton value={value}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? "Copied" : "Copy URL"} withArrow>
            <ActionIcon
              variant="subtle"
              onClick={copy}
              aria-label="Copy trigger URL"
            >
              {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}

function CurlCopyBlock({ value }: { value: string }) {
  return (
    <Box>
      <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
        {value}
      </Code>
      <Group justify="flex-end" mt="xs">
        <CopyButton value={value}>
          {({ copied, copy }) => (
            <Button
              variant="light"
              size="xs"
              leftSection={
                copied ? <IconCheck size={14} /> : <IconCopy size={14} />
              }
              onClick={copy}
            >
              {copied ? "Copied" : "Copy curl"}
            </Button>
          )}
        </CopyButton>
      </Group>
    </Box>
  );
}

function InputSchemaList({ schema }: { schema: RunSpecInputSchema }) {
  const entries = Object.entries(schema.properties);
  if (entries.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No inputs declared. Mark ctx entries as "Input" in Workflow settings to
        expose them here.
      </Text>
    );
  }
  const requiredSet = new Set(schema.required);
  return (
    <Table withColumnBorders highlightOnHover striped fz="xs">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Field</Table.Th>
          <Table.Th>Type</Table.Th>
          <Table.Th>Required</Table.Th>
          <Table.Th>Description / default</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {entries.map(([key, property]) => (
          <Table.Tr key={key}>
            <Table.Td>
              <Code>{key}</Code>
              {property.title && property.title !== key && (
                <Text size="xs" c="dimmed">
                  {property.title}
                </Text>
              )}
            </Table.Td>
            <Table.Td>
              <Badge size="xs" variant="light">
                {property.type}
              </Badge>
            </Table.Td>
            <Table.Td>
              {requiredSet.has(key) ? (
                <Badge size="xs" color="red" variant="light">
                  required
                </Badge>
              ) : (
                <Text size="xs" c="dimmed">
                  optional
                </Text>
              )}
            </Table.Td>
            <Table.Td>
              {property.description && (
                <Text size="xs">{property.description}</Text>
              )}
              {property.default !== undefined && (
                <Text size="xs" c="dimmed">
                  default: <Code>{JSON.stringify(property.default)}</Code>
                </Text>
              )}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
