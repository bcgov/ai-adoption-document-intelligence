import {
  Badge,
  Button,
  Grid,
  Group,
  Loader,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconCheck } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { WorkflowVisualization } from "../components/workflow/WorkflowVisualization";
import { useUpdateWorkflow, useWorkflow } from "../data/hooks/useWorkflows";
import { useTemplateModels } from "../features/annotation/template-models/hooks/useTemplateModels";
import type { WorkflowStepsConfig } from "../types/workflow";

interface WorkflowStepConfig {
  enabled: boolean;
  parameters?: Record<string, unknown>;
}

interface WorkflowConfig {
  name: string;
  description?: string;
  steps: {
    updateStatus?: WorkflowStepConfig;
    prepareFileData?: WorkflowStepConfig;
    submitToAzureOCR?: WorkflowStepConfig;
    updateApimRequestId?: WorkflowStepConfig;
    waitBeforePoll?: WorkflowStepConfig;
    pollOCRResults?: WorkflowStepConfig;
    extractOCRResults?: WorkflowStepConfig;
    postOcrCleanup?: WorkflowStepConfig;
    enrichResults?: WorkflowStepConfig;
    checkOcrConfidence?: WorkflowStepConfig;
    humanReview?: WorkflowStepConfig;
    storeResults?: WorkflowStepConfig;
  };
}

interface WorkflowEditPageProps {
  workflowId: string;
  onBack?: () => void;
  onSave?: () => void;
}

export function WorkflowEditPage({
  workflowId,
  onBack,
  onSave,
}: WorkflowEditPageProps) {
  const { data: workflow, isLoading, error } = useWorkflow(workflowId);
  const updateWorkflowMutation = useUpdateWorkflow();
  const [workflowName, setWorkflowName] = useState("");
  const [workflowDescription, setWorkflowDescription] = useState("");
  const [config, setConfig] = useState<WorkflowConfig>({
    name: "",
    steps: {
      updateStatus: { enabled: true },
      prepareFileData: { enabled: true },
      submitToAzureOCR: { enabled: true },
      updateApimRequestId: { enabled: true },
      waitBeforePoll: { enabled: true, parameters: { waitTime: 5000 } },
      pollOCRResults: {
        enabled: true,
        parameters: {
          maxRetries: 20,
          waitBeforeFirstPoll: 5000,
          waitBetweenPolls: 10000,
        },
      },
      extractOCRResults: { enabled: true },
      postOcrCleanup: { enabled: true },
      enrichResults: {
        enabled: false,
        parameters: {
          documentType: "",
          confidenceThreshold: 0.85,
          enableLlmEnrichment: false,
        },
      },
      checkOcrConfidence: { enabled: true, parameters: { threshold: 0.95 } },
      humanReview: { enabled: true, parameters: { timeout: 86400000 } },
      storeResults: { enabled: true },
    },
  });

  // Load workflow data when it's available
  useEffect(() => {
    if (workflow) {
      setWorkflowName(workflow.name);
      setWorkflowDescription(workflow.description || "");

      // Convert WorkflowStepsConfig to our local config format
      // Handle backward compatibility: config might be wrapped in a "steps" key
      const configData = workflow.config as
        | WorkflowStepsConfig
        | { steps?: WorkflowStepsConfig };
      let stepsConfig: WorkflowStepsConfig;

      // Check if config is wrapped in "steps" key (backward compatibility)
      if (
        configData &&
        typeof configData === "object" &&
        "steps" in configData &&
        configData.steps
      ) {
        stepsConfig = configData.steps as WorkflowStepsConfig;
      } else {
        stepsConfig = configData as WorkflowStepsConfig;
      }

      const localConfig: WorkflowConfig["steps"] = {};

      // Map each step from the workflow config
      // Filter out any invalid keys (like "steps" if it was at the wrong level)
      const validStepIds = [
        "updateStatus",
        "prepareFileData",
        "submitToAzureOCR",
        "updateApimRequestId",
        "waitBeforePoll",
        "pollOCRResults",
        "extractOCRResults",
        "postOcrCleanup",
        "enrichResults",
        "checkOcrConfidence",
        "humanReview",
        "storeResults",
      ];

      Object.keys(stepsConfig).forEach((stepId) => {
        // Only process valid step IDs
        if (validStepIds.includes(stepId)) {
          const stepConfig = stepsConfig[stepId];
          if (stepConfig) {
            localConfig[stepId as keyof WorkflowConfig["steps"]] = {
              enabled: stepConfig.enabled !== false,
              parameters: stepConfig.parameters || {},
            };
          }
        }
      });

      setConfig({
        name: workflow.name,
        description: workflow.description ?? undefined,
        steps: localConfig,
      });
    }
  }, [workflow]);

  // Helper function to update step parameters
  const updateStepParameter = (
    stepId: keyof WorkflowConfig["steps"],
    param: string,
    value: unknown,
  ) => {
    setConfig((prev) => ({
      ...prev,
      steps: {
        ...prev.steps,
        [stepId]: {
          ...prev.steps[stepId],
          enabled: prev.steps[stepId]?.enabled ?? true,
          parameters: {
            ...prev.steps[stepId]?.parameters,
            [param]: value,
          },
        },
      },
    }));
  };

  const handleStepToggle = (
    stepId: keyof WorkflowConfig["steps"],
    enabled: boolean,
  ) => {
    setConfig((prev) => ({
      ...prev,
      steps: {
        ...prev.steps,
        [stepId]: { ...prev.steps[stepId], enabled },
      },
    }));
  };

  // Derive values from config state
  const pollMaxRetries =
    (config.steps.pollOCRResults?.parameters?.maxRetries as number) ?? 20;
  const pollWaitBeforeFirst =
    (config.steps.pollOCRResults?.parameters?.waitBeforeFirstPoll as number) ??
    5000;
  const pollWaitBetween =
    (config.steps.pollOCRResults?.parameters?.waitBetweenPolls as number) ??
    10000;
  const confidenceThreshold =
    (config.steps.checkOcrConfidence?.parameters?.threshold as number) ?? 0.95;
  const humanReviewTimeoutMs =
    (config.steps.humanReview?.parameters?.timeout as number) ?? 86400000;
  const humanReviewTimeoutDays = humanReviewTimeoutMs / (1000 * 60 * 60 * 24);
  const waitBeforePollTime =
    (config.steps.waitBeforePoll?.parameters?.waitTime as number) ?? 5000;
  const enrichmentDocumentType =
    (config.steps.enrichResults?.parameters?.documentType as string) ?? "";
  const enrichmentConfidenceThreshold =
    (config.steps.enrichResults?.parameters?.confidenceThreshold as number) ??
    0.85;
  const enrichmentEnableLlm =
    (config.steps.enrichResults?.parameters?.enableLlmEnrichment as boolean) ??
    false;

  const { templateModels, isLoading: projectsLoading } = useTemplateModels();
  const projectOptions = templateModels.map((p) => ({ value: p.id, label: p.name }));

  const handleSaveWorkflow = async () => {
    if (!workflowName.trim()) {
      notifications.show({
        title: "Error",
        message: "Please provide a workflow name",
        color: "red",
      });
      return;
    }

    // Build the workflow configuration directly from config state
    // Ensure we only send step IDs as keys, not wrapped in a "steps" object
    const workflowStepsConfig: WorkflowStepsConfig = {};

    // Copy only valid step configurations, filtering out any invalid keys
    const validStepIds = [
      "updateStatus",
      "prepareFileData",
      "submitToAzureOCR",
      "updateApimRequestId",
      "waitBeforePoll",
      "pollOCRResults",
      "extractOCRResults",
      "postOcrCleanup",
      "enrichResults",
      "checkOcrConfidence",
      "humanReview",
      "storeResults",
    ];

    Object.keys(config.steps).forEach((stepId) => {
      if (validStepIds.includes(stepId)) {
        const stepConfig = config.steps[stepId as keyof typeof config.steps];
        if (stepConfig) {
          workflowStepsConfig[stepId] = {
            enabled: stepConfig.enabled,
            parameters: stepConfig.parameters,
          };
        }
      }
    });

    try {
      const updated = await updateWorkflowMutation.mutateAsync({
        id: workflowId,
        dto: {
          name: workflowName,
          description: workflowDescription || undefined,
          config:
            workflowStepsConfig as unknown as import("../types/workflow").GraphWorkflowConfig,
        },
      });

      const versionMessage =
        updated.version > (workflow?.version || 1)
          ? ` (version incremented to ${updated.version})`
          : "";

      notifications.show({
        title: "Success",
        message: `Workflow "${workflowName}" updated successfully${versionMessage}`,
        color: "green",
      });

      if (onSave) {
        onSave();
      }
    } catch (error) {
      notifications.show({
        title: "Error",
        message:
          error instanceof Error ? error.message : "Failed to update workflow",
        color: "red",
      });
    }
  };

  if (isLoading) {
    return (
      <Stack gap="lg" align="center" justify="center" mih="50vh">
        <Loader size="lg" />
        <Text c="dimmed">Loading workflow...</Text>
      </Stack>
    );
  }

  if (error || !workflow) {
    return (
      <Stack gap="lg">
        <Title order={2}>Edit Workflow</Title>
        <Paper shadow="sm" radius="md" p="lg" withBorder>
          <Text c="red">
            {error instanceof Error ? error.message : "Workflow not found"}
          </Text>
          {onBack && (
            <Button
              leftSection={<IconArrowLeft size={16} />}
              onClick={onBack}
              mt="md"
            >
              Back to Workflows
            </Button>
          )}
        </Paper>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Stack gap={2}>
          <Title order={2}>Edit Workflow</Title>
          <Text c="dimmed" size="sm">
            Modify workflow configuration and parameters
          </Text>
        </Stack>
        <Group>
          <Badge variant="light" color="blue" size="lg">
            Version {workflow.version}
          </Badge>
          <Badge variant="outline" size="lg">
            Workflow Builder
          </Badge>
        </Group>
      </Group>

      <Grid>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="lg">
            <Paper shadow="sm" radius="md" p="lg" withBorder>
              <Stack gap="md">
                <Title order={3}>Description</Title>
                <TextInput
                  label="Workflow Name"
                  placeholder="e.g., High-Confidence OCR Workflow"
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  required
                />
                <TextInput
                  label="Description"
                  placeholder="Optional description of this workflow"
                  value={workflowDescription}
                  onChange={(e) => setWorkflowDescription(e.target.value)}
                />
              </Stack>
            </Paper>

            <Paper shadow="sm" radius="md" p="lg" withBorder>
              <Stack gap="md">
                <Title order={3}>Workflow Steps</Title>
                <Text c="dimmed" size="sm">
                  Enable or disable steps and configure their parameters
                </Text>

                <Stack gap="md">
                  {/* Update Status */}
                  <Switch
                    label="Update Status"
                    description="Update document status in database"
                    checked={config.steps.updateStatus?.enabled ?? true}
                    onChange={(e) =>
                      handleStepToggle("updateStatus", e.currentTarget.checked)
                    }
                  />

                  {/* Prepare File Data */}
                  <Switch
                    label="Prepare File Data"
                    description="Validate and prepare file data for OCR"
                    checked={config.steps.prepareFileData?.enabled ?? true}
                    onChange={(e) =>
                      handleStepToggle(
                        "prepareFileData",
                        e.currentTarget.checked,
                      )
                    }
                  />

                  {/* Submit to Azure OCR */}
                  <Switch
                    label="Submit to Azure OCR"
                    description="Submit document to Azure Document Intelligence"
                    checked={config.steps.submitToAzureOCR?.enabled ?? true}
                    onChange={(e) =>
                      handleStepToggle(
                        "submitToAzureOCR",
                        e.currentTarget.checked,
                      )
                    }
                  />

                  {/* Update APIM Request ID */}
                  <Switch
                    label="Update APIM Request ID"
                    description="Store Azure API request ID"
                    checked={config.steps.updateApimRequestId?.enabled ?? true}
                    onChange={(e) =>
                      handleStepToggle(
                        "updateApimRequestId",
                        e.currentTarget.checked,
                      )
                    }
                  />

                  {/* Wait Before Poll */}
                  <Paper p="md" withBorder>
                    <Stack gap="xs">
                      <Switch
                        label="Wait Before Poll"
                        description="Wait before starting to poll for OCR results"
                        checked={config.steps.waitBeforePoll?.enabled ?? true}
                        onChange={(e) =>
                          handleStepToggle(
                            "waitBeforePoll",
                            e.currentTarget.checked,
                          )
                        }
                      />
                      {config.steps.waitBeforePoll?.enabled && (
                        <NumberInput
                          label="Wait Time (ms)"
                          value={waitBeforePollTime}
                          onChange={(value) =>
                            updateStepParameter(
                              "waitBeforePoll",
                              "waitTime",
                              Number(value) || 0,
                            )
                          }
                          min={0}
                          step={1000}
                          description="Time to wait before first poll (milliseconds)"
                        />
                      )}
                    </Stack>
                  </Paper>

                  {/* Poll OCR Results */}
                  <Paper p="md" withBorder>
                    <Stack gap="xs">
                      <Switch
                        label="Poll OCR Results"
                        description="Poll Azure API for OCR completion status"
                        checked={config.steps.pollOCRResults?.enabled ?? true}
                        onChange={(e) =>
                          handleStepToggle(
                            "pollOCRResults",
                            e.currentTarget.checked,
                          )
                        }
                      />
                      {config.steps.pollOCRResults?.enabled && (
                        <Stack gap="xs">
                          <NumberInput
                            label="Max Retries"
                            value={pollMaxRetries}
                            onChange={(value) =>
                              updateStepParameter(
                                "pollOCRResults",
                                "maxRetries",
                                Number(value) || 0,
                              )
                            }
                            min={1}
                            max={100}
                            description="Maximum number of polling attempts"
                          />
                          <NumberInput
                            label="Wait Before First Poll (ms)"
                            value={pollWaitBeforeFirst}
                            onChange={(value) =>
                              updateStepParameter(
                                "pollOCRResults",
                                "waitBeforeFirstPoll",
                                Number(value) || 0,
                              )
                            }
                            min={0}
                            step={1000}
                            description="Time to wait before first poll attempt"
                          />
                          <NumberInput
                            label="Wait Between Polls (ms)"
                            value={pollWaitBetween}
                            onChange={(value) =>
                              updateStepParameter(
                                "pollOCRResults",
                                "waitBetweenPolls",
                                Number(value) || 0,
                              )
                            }
                            min={0}
                            step={1000}
                            description="Time to wait between polling attempts"
                          />
                        </Stack>
                      )}
                    </Stack>
                  </Paper>

                  {/* Extract OCR Results */}
                  <Switch
                    label="Extract OCR Results"
                    description="Extract structured data from OCR response"
                    checked={config.steps.extractOCRResults?.enabled ?? true}
                    onChange={(e) =>
                      handleStepToggle(
                        "extractOCRResults",
                        e.currentTarget.checked,
                      )
                    }
                  />

                  {/* Post-OCR Cleanup */}
                  <Switch
                    label="Post-OCR Cleanup"
                    description="Clean up OCR text (unicode fixes, dehyphenation, etc.)"
                    checked={config.steps.postOcrCleanup?.enabled ?? true}
                    onChange={(e) =>
                      handleStepToggle(
                        "postOcrCleanup",
                        e.currentTarget.checked,
                      )
                    }
                  />

                  {/* Enrich Results */}
                  <Paper p="md" withBorder>
                    <Stack gap="xs">
                      <Switch
                        label="Enrich Results"
                        description="Apply rules and optional LLM enrichment using a document type (LabelingProject)"
                        checked={config.steps.enrichResults?.enabled ?? false}
                        onChange={(e) =>
                          handleStepToggle(
                            "enrichResults",
                            e.currentTarget.checked,
                          )
                        }
                      />
                      {config.steps.enrichResults?.enabled && (
                        <Stack gap="xs">
                          <Select
                            label="Document type"
                            placeholder="Select a labeling project"
                            data={projectOptions}
                            value={enrichmentDocumentType || null}
                            onChange={(value) =>
                              updateStepParameter(
                                "enrichResults",
                                "documentType",
                                value ?? "",
                              )
                            }
                            searchable
                            clearable
                            description="Project whose field schema is used for enrichment rules"
                            disabled={projectsLoading}
                          />
                          <NumberInput
                            label="LLM confidence threshold"
                            value={enrichmentConfidenceThreshold}
                            onChange={(value) =>
                              updateStepParameter(
                                "enrichResults",
                                "confidenceThreshold",
                                Number(value) ?? 0.85,
                              )
                            }
                            min={0}
                            max={1}
                            step={0.05}
                            description="Fields below this confidence are candidates for LLM enrichment (0–1)"
                          />
                          <Switch
                            label="Enable LLM enrichment"
                            description="Send low-confidence fields to Azure OpenAI for correction"
                            checked={enrichmentEnableLlm}
                            onChange={(e) =>
                              updateStepParameter(
                                "enrichResults",
                                "enableLlmEnrichment",
                                e.currentTarget.checked,
                              )
                            }
                          />
                        </Stack>
                      )}
                    </Stack>
                  </Paper>

                  {/* Check OCR Confidence */}
                  <Paper p="md" withBorder>
                    <Stack gap="xs">
                      <Switch
                        label="Check OCR Confidence"
                        description="Validate OCR confidence threshold"
                        checked={
                          config.steps.checkOcrConfidence?.enabled ?? true
                        }
                        onChange={(e) =>
                          handleStepToggle(
                            "checkOcrConfidence",
                            e.currentTarget.checked,
                          )
                        }
                      />
                      {config.steps.checkOcrConfidence?.enabled && (
                        <NumberInput
                          label="Confidence Threshold"
                          value={confidenceThreshold}
                          onChange={(value) =>
                            updateStepParameter(
                              "checkOcrConfidence",
                              "threshold",
                              Number(value) || 0,
                            )
                          }
                          min={0}
                          max={1}
                          step={0.05}
                          description="Minimum confidence score (0-1). Documents below this will require human review."
                        />
                      )}
                    </Stack>
                  </Paper>

                  {/* Human Review */}
                  <Paper p="md" withBorder>
                    <Stack gap="xs">
                      <Switch
                        label="Human Review"
                        description="Require human approval for low-confidence results"
                        checked={config.steps.humanReview?.enabled ?? true}
                        onChange={(e) =>
                          handleStepToggle(
                            "humanReview",
                            e.currentTarget.checked,
                          )
                        }
                      />
                      {config.steps.humanReview?.enabled && (
                        <NumberInput
                          label="Review Timeout (days)"
                          value={humanReviewTimeoutDays}
                          onChange={(value) => {
                            const days = Number(value) || 0;
                            const milliseconds = days * 24 * 60 * 60 * 1000;
                            updateStepParameter(
                              "humanReview",
                              "timeout",
                              milliseconds,
                            );
                          }}
                          min={0}
                          step={1}
                          description="Maximum time to wait for human review (days). Default: 1 day"
                        />
                      )}
                    </Stack>
                  </Paper>

                  {/* Store Results */}
                  <Switch
                    label="Store Results"
                    description="Save OCR results to database"
                    checked={config.steps.storeResults?.enabled ?? true}
                    onChange={(e) =>
                      handleStepToggle("storeResults", e.currentTarget.checked)
                    }
                  />
                </Stack>
              </Stack>
            </Paper>

            <Group justify="space-between">
              {onBack && (
                <Button
                  variant="subtle"
                  leftSection={<IconArrowLeft size={16} />}
                  onClick={onBack}
                >
                  Back to Workflows
                </Button>
              )}
              <Button
                leftSection={<IconCheck size={16} />}
                onClick={handleSaveWorkflow}
                size="lg"
                loading={updateWorkflowMutation.isPending}
              >
                Save Changes
              </Button>
            </Group>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <div style={{ position: "sticky", top: "20px" }}>
            <WorkflowVisualization config={config} />
          </div>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
