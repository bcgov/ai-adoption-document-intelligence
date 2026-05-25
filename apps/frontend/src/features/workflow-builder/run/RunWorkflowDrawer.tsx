/**
 * Run-this-workflow drawer (Phase 2 Track 2 — US-071, US-072;
 * Phase 8 — US-123; Phase 4 — US-148, US-149).
 *
 * Right-side Mantine Drawer that documents how to trigger the workflow
 * from outside (URL + input schema + sample curl + auth notes) and
 * lets the author paste a JSON body and start a real Temporal
 * execution directly from the editor.
 *
 * US-123 extends the drawer to render up to TWO source sections,
 * driven by the `/run-spec` response shape (DOCUMENT_SOURCES_DESIGN.md
 * §7.4):
 *   - API section — rendered when `uploadSpec` is absent (legacy +
 *     source.api workflows). The schema's derivation source
 *     (source.api vs isInput) is invisible at this layer.
 *   - Upload section — rendered when `uploadSpec` is present.
 *   - Both — rendered when `uploadSpec` AND a non-empty `inputSchema`
 *     are present (workflows with both a source.api and a source.upload).
 *   - Neither effectively never happens: the API section always
 *     renders unless the workflow has a source.upload AND no
 *     source.api / no isInput-flagged ctx (i.e. empty inputSchema).
 *
 * US-149 (Phase 4) wraps the API section in a two-tab layout
 * (Try / Run) backed by the same JsonInput shape. The "Run" tab is the
 * existing Phase 2 Track 2 API-validation surface (paste body → see
 * workflowId inline, drawer stays open). The "Try" tab uses the same
 * JsonInput but submits with canvas-iteration semantics: cancel any
 * in-flight Try (server-side via the existing `POST /runs` cancel
 * extension), call `setActiveRunId` so the canvas's polling loops
 * start, and close the drawer immediately. The Upload section (US-123)
 * stays below the tabs and keeps its existing upload-then-run chain —
 * Tabs are JsonInput-only.
 */

import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Code,
  CopyButton,
  Divider,
  Drawer,
  Group,
  JsonInput,
  Loader,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { notifications } from "@mantine/notifications";
import {
  IconBolt,
  IconCheck,
  IconCopy,
  IconFile,
  IconPlayerPlay,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import {
  type RunSpecInputSchema,
  type RunSpecUploadSpec,
  type StartRunRequest,
  useStartWorkflowRun,
  useWorkflowRunSpec,
  useWorkflowVersions,
  type WorkflowRunSpec,
} from "../../../data/hooks/useWorkflows";
import { useSourceUpload } from "../sources/useSourceUpload";
import { buildStubInput } from "./build-stub-input";
import { useOptionalRunState } from "./RunStateContext";

/**
 * Controls which tab the drawer pre-selects when it opens.
 *
 * Phase 4 — US-148 introduces a sibling "Try" top-bar button that opens
 * the same drawer but on a different tab. US-148 only adds the prop +
 * trigger plumbing; the actual tab UI is implemented in US-149. Until
 * then this prop is accepted (so the trigger surface compiles + tests
 * cover both modes) but does not yet affect rendering.
 */
export type RunWorkflowDrawerOpenMode = "run" | "try";

interface RunWorkflowDrawerProps {
  opened: boolean;
  onClose: () => void;
  workflowId: string;
  /**
   * The current head version id of the workflow lineage. Used as the
   * default selection for the version `<Select>` and to decide whether
   * to send `workflowVersionId` in the run body (head is the backend's
   * default — body omits the field when head is selected).
   */
  headVersionId: string | undefined;
  /**
   * Which tab the drawer should pre-select on open. Defaults to
   * `"run"`. The "Try" tab itself lands in US-149; this prop is the
   * plumbing US-148 lays down so the in-canvas Try button can request
   * the Try tab without further drawer changes once US-149 ships.
   */
  openMode?: RunWorkflowDrawerOpenMode;
}

export function RunWorkflowDrawer({
  opened,
  onClose,
  workflowId,
  headVersionId,
  openMode = "run",
}: RunWorkflowDrawerProps) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    headVersionId ?? null,
  );

  // Keep the selected version in sync with the head as it loads / changes
  // (e.g. on initial open, or after a revert).
  useEffect(() => {
    if (headVersionId) {
      setSelectedVersionId(headVersionId);
    }
  }, [headVersionId]);

  const isHeadSelected = !!headVersionId && selectedVersionId === headVersionId;

  const runSpecQuery = useWorkflowRunSpec(opened ? workflowId : undefined, {
    workflowVersionId: isHeadSelected
      ? undefined
      : (selectedVersionId ?? undefined),
  });
  const versionsQuery = useWorkflowVersions(opened ? workflowId : undefined);

  const versionSelectData = useMemo(() => {
    const versions = versionsQuery.data ?? [];
    return versions.map((v) => ({
      value: v.id,
      label:
        v.id === headVersionId
          ? `v${v.versionNumber} — head`
          : `v${v.versionNumber}`,
    }));
  }, [versionsQuery.data, headVersionId]);

  const runSpec = runSpecQuery.data;
  const uploadSpec = runSpec?.uploadSpec;
  const hasInputSchemaFields =
    !!runSpec && Object.keys(runSpec.inputSchema.properties).length > 0;
  // When uploadSpec is absent we always render the API section (legacy
  // + source.api workflows). When uploadSpec is present we only render
  // the API section if there are real input fields to surface — an
  // upload-only workflow ships with an empty inputSchema (US-111's
  // precedence returns an empty schema when no source.api / isInput
  // exists).
  const showApiSection = !!runSpec && (!uploadSpec || hasInputSchemaFields);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={520}
      title={<Title order={4}>Run this workflow</Title>}
      padding="md"
      data-testid="run-workflow-drawer"
      data-open-mode={openMode}
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

      {runSpec && (
        <Stack gap="lg">
          {showApiSection && (
            <Tabs
              defaultValue={openMode}
              keepMounted={false}
              data-testid="run-drawer-tabs"
            >
              <Tabs.List>
                <Tabs.Tab
                  value="try"
                  leftSection={<IconBolt size={14} />}
                  data-testid="run-drawer-tab-try"
                >
                  Try
                </Tabs.Tab>
                <Tabs.Tab
                  value="run"
                  leftSection={<IconPlayerPlay size={14} />}
                  data-testid="run-drawer-tab-run"
                >
                  Run
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="try" pt="md">
                <TrySourceSection
                  runSpec={runSpec}
                  workflowId={workflowId}
                  selectedVersionId={selectedVersionId}
                  setSelectedVersionId={setSelectedVersionId}
                  versionSelectData={versionSelectData}
                  versionsLoading={versionsQuery.isLoading}
                  isHeadSelected={isHeadSelected}
                  onClose={onClose}
                />
              </Tabs.Panel>

              <Tabs.Panel value="run" pt="md">
                <ApiSourceSection
                  runSpec={runSpec}
                  workflowId={workflowId}
                  selectedVersionId={selectedVersionId}
                  setSelectedVersionId={setSelectedVersionId}
                  versionSelectData={versionSelectData}
                  versionsLoading={versionsQuery.isLoading}
                  isHeadSelected={isHeadSelected}
                />
              </Tabs.Panel>
            </Tabs>
          )}

          {showApiSection && uploadSpec && <Divider />}

          {uploadSpec && (
            <UploadSourceSection
              uploadSpec={uploadSpec}
              workflowId={workflowId}
              selectedVersionId={selectedVersionId}
              isHeadSelected={isHeadSelected}
            />
          )}
        </Stack>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// API source section (Phase 2 Track 2 — unchanged behavior; extracted so
// the drawer's top-level render stays scannable now that there's a sibling
// Upload section).
// ---------------------------------------------------------------------------

interface ApiSourceSectionProps {
  runSpec: WorkflowRunSpec;
  workflowId: string;
  selectedVersionId: string | null;
  setSelectedVersionId: (value: string | null) => void;
  versionSelectData: { value: string; label: string }[];
  versionsLoading: boolean;
  isHeadSelected: boolean;
}

function ApiSourceSection({
  runSpec,
  workflowId,
  selectedVersionId,
  setSelectedVersionId,
  versionSelectData,
  versionsLoading,
  isHeadSelected,
}: ApiSourceSectionProps) {
  const startRun = useStartWorkflowRun();
  const [pasteBody, setPasteBody] = useState<string>("");
  const [lastWorkflowId, setLastWorkflowId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Prefill the JsonInput whenever the schema changes (i.e. when the
  // drawer opens for a workflow with a fresh schema).
  useEffect(() => {
    const stub = buildStubInput(runSpec.inputSchema);
    setPasteBody(JSON.stringify(stub, null, 2));
    setLastWorkflowId(null);
    setRunError(null);
  }, [runSpec]);

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
      // Omit `workflowVersionId` entirely when head is selected so the
      // backend defaults to head (matches Track 2 default behaviour).
      const body: StartRunRequest =
        isHeadSelected || !selectedVersionId
          ? { initialCtx }
          : { initialCtx, workflowVersionId: selectedVersionId };
      const result = await startRun.mutateAsync({
        workflowId,
        body,
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
    <Stack gap="lg" data-testid="run-drawer-api-section">
      <Section title="Trigger URL">
        <UrlCopyBlock value={runSpec.triggerUrl} />
      </Section>

      <Section title="Input schema">
        <InputSchemaList schema={runSpec.inputSchema} />
      </Section>

      <Section title="Sample curl">
        <CurlCopyBlock value={runSpec.sampleCurl} />
      </Section>

      <Section title="Authentication">
        <Text size="sm">{runSpec.authNotes}</Text>
      </Section>

      <Section title="Test run">
        <Stack gap="xs">
          <Select
            label="Version"
            data={versionSelectData}
            value={selectedVersionId}
            onChange={(value) => setSelectedVersionId(value)}
            disabled={versionsLoading || versionSelectData.length === 0}
            allowDeselect={false}
            aria-label="Workflow version to run"
            data-testid="run-workflow-version-select"
          />
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
            <Alert
              color="green"
              title="Workflow run started"
              data-testid="run-drawer-api-success"
            >
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
  );
}

// ---------------------------------------------------------------------------
// Upload source section (Phase 8 — US-123). Dropzone constrained by the
// source.upload's MIME / size config; Run uploads then chains the result
// into `/runs` as `initialCtx[<ctxKey>] = storageUrl`.
// ---------------------------------------------------------------------------

interface UploadSourceSectionProps {
  uploadSpec: RunSpecUploadSpec;
  workflowId: string;
  selectedVersionId: string | null;
  isHeadSelected: boolean;
}

function UploadSourceSection({
  uploadSpec,
  workflowId,
  selectedVersionId,
  isHeadSelected,
}: UploadSourceSectionProps) {
  const upload = useSourceUpload(workflowId, uploadSpec.sourceNodeId);
  const startRun = useStartWorkflowRun();
  const [file, setFile] = useState<File | null>(null);
  const [lastWorkflowId, setLastWorkflowId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Reset local state when the upload target source changes (e.g. user
  // switches to a different workflow version whose source.upload has
  // different config).
  useEffect(() => {
    setFile(null);
    setLastWorkflowId(null);
    setRunError(null);
  }, [uploadSpec.sourceNodeId]);

  const maxBytes = uploadSpec.maxFileSizeMB * 1024 * 1024;
  const constraintsLabel = useMemo(() => {
    const mimes = uploadSpec.allowedMimeTypes.join(", ");
    return `Accepts ${mimes}, max ${uploadSpec.maxFileSizeMB}MB`;
  }, [uploadSpec.allowedMimeTypes, uploadSpec.maxFileSizeMB]);

  const handleDrop = (files: File[]) => {
    if (files.length === 0) return;
    setFile(files[0]);
    setLastWorkflowId(null);
    setRunError(null);
  };

  const handleRun = async () => {
    if (!file) return;
    setRunError(null);
    try {
      const uploadResult = await upload.mutateAsync(file);
      const body: StartRunRequest =
        isHeadSelected || !selectedVersionId
          ? { initialCtx: uploadResult }
          : { initialCtx: uploadResult, workflowVersionId: selectedVersionId };
      const result = await startRun.mutateAsync({
        workflowId,
        body,
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

  const isPending = upload.isPending || startRun.isPending;

  return (
    <Stack gap="lg" data-testid="run-drawer-upload-section">
      <Section title="Upload a file">
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            {constraintsLabel}
          </Text>
          <Dropzone
            onDrop={handleDrop}
            accept={uploadSpec.allowedMimeTypes}
            maxSize={maxBytes}
            multiple={false}
            loading={isPending}
            data-testid="run-drawer-upload-dropzone"
          >
            <Group
              justify="center"
              gap="xl"
              mih={120}
              style={{ pointerEvents: "none" }}
            >
              <Dropzone.Accept>
                <IconUpload size={32} />
              </Dropzone.Accept>
              <Dropzone.Reject>
                <IconX size={32} />
              </Dropzone.Reject>
              <Dropzone.Idle>
                <IconFile size={32} />
              </Dropzone.Idle>
              <Box>
                <Text size="sm" inline>
                  {file
                    ? `Selected: ${file.name}`
                    : "Drop a file here or click to browse"}
                </Text>
                <Text size="xs" c="dimmed" inline mt={4}>
                  {constraintsLabel}
                </Text>
              </Box>
            </Group>
          </Dropzone>
          <Group justify="flex-end">
            <Button
              leftSection={<IconPlayerPlay size={14} />}
              onClick={handleRun}
              disabled={!file}
              loading={isPending}
              data-testid="run-drawer-upload-run-button"
            >
              Run
            </Button>
          </Group>
          {lastWorkflowId && (
            <Alert
              color="green"
              title="Workflow run started"
              data-testid="run-drawer-upload-success"
            >
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
  );
}

// ---------------------------------------------------------------------------
// Try source section (Phase 4 — US-149). Uses the same JsonInput shape as
// the API/Run tab but submits with canvas-iteration semantics: cancel
// in-flight Try (server-side via `POST /runs` — extended in this story),
// set `activeRunId` so the canvas's polling loops start BEFORE the drawer
// closes, then close the drawer. No inline workflowId result — the canvas
// is the result surface. Errors keep the drawer open with a red Alert.
// ---------------------------------------------------------------------------

interface TrySourceSectionProps {
  runSpec: WorkflowRunSpec;
  workflowId: string;
  selectedVersionId: string | null;
  setSelectedVersionId: (value: string | null) => void;
  versionSelectData: { value: string; label: string }[];
  versionsLoading: boolean;
  isHeadSelected: boolean;
  onClose: () => void;
}

function TrySourceSection({
  runSpec,
  workflowId,
  selectedVersionId,
  setSelectedVersionId,
  versionSelectData,
  versionsLoading,
  isHeadSelected,
  onClose,
}: TrySourceSectionProps) {
  const startRun = useStartWorkflowRun();
  // Soft-fail outside a `<RunStateProvider>` — keeps drawer-only unit
  // tests (US-149 Scenario 6 + the existing Phase 2 / Phase 8 suites)
  // rendering even though they don't mount the provider. Production
  // callers always sit beneath the provider mounted by
  // `WorkflowEditorV2Page`.
  const runState = useOptionalRunState();
  const [pasteBody, setPasteBody] = useState<string>("");
  const [runError, setRunError] = useState<string | null>(null);

  // Prefill the JsonInput whenever the schema changes (mirrors the
  // Run tab's behaviour — same body shape, same prefill).
  useEffect(() => {
    const stub = buildStubInput(runSpec.inputSchema);
    setPasteBody(JSON.stringify(stub, null, 2));
    setRunError(null);
  }, [runSpec]);

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

  const handleTry = async () => {
    if (parseError !== null) return;
    setRunError(null);
    try {
      const initialCtx = pasteBody.trim()
        ? (JSON.parse(pasteBody) as Record<string, unknown>)
        : {};
      // Omit `workflowVersionId` entirely when head is selected so the
      // backend defaults to head (matches the Run tab's wire shape).
      const body: StartRunRequest =
        isHeadSelected || !selectedVersionId
          ? { initialCtx }
          : { initialCtx, workflowVersionId: selectedVersionId };
      const result = await startRun.mutateAsync({
        workflowId,
        body,
      });
      // Set `activeRunId` BEFORE closing the drawer so the canvas's
      // polling loops (US-138 hookup) start before the drawer unmounts
      // — keeps the "canvas is the result surface" handoff visible.
      runState?.setActiveRunId(result.workflowId);
      notifications.show({
        title: "Try started",
        message: result.workflowId,
        color: "blue",
      });
      onClose();
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Stack gap="lg" data-testid="run-drawer-try-section">
      <Section title="Initial ctx">
        <Stack gap="xs">
          <Select
            label="Version"
            data={versionSelectData}
            value={selectedVersionId}
            onChange={(value) => setSelectedVersionId(value)}
            disabled={versionsLoading || versionSelectData.length === 0}
            allowDeselect={false}
            aria-label="Workflow version to try"
            data-testid="try-workflow-version-select"
          />
          <JsonInput
            value={pasteBody}
            onChange={setPasteBody}
            minRows={6}
            autosize
            formatOnBlur
            placeholder='{"customerId": "..."}'
            aria-label="Initial ctx JSON for the in-canvas Try"
            error={parseError ?? undefined}
          />
          <Group justify="flex-end">
            <Button
              color="blue"
              leftSection={<IconBolt size={14} />}
              onClick={handleTry}
              disabled={parseError !== null}
              loading={startRun.isPending}
              data-testid="try-workflow-button"
            >
              Try
            </Button>
          </Group>
          {runError && (
            <Alert
              color="red"
              title="Try failed"
              data-testid="run-drawer-try-error"
            >
              {runError}
            </Alert>
          )}
        </Stack>
      </Section>
    </Stack>
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
