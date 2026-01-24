import {
  Badge,
  Button,
  Grid,
  Group,
  NumberInput,
  Paper,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconFlask, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { WorkflowVisualization } from "../components/workflow/WorkflowVisualization";
import { useCreateWorkflow } from "../data/hooks/useWorkflows";
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
    checkOcrConfidence?: WorkflowStepConfig;
    humanReview?: WorkflowStepConfig;
    storeResults?: WorkflowStepConfig;
  };
}

export function WorkflowPage() {
  const createWorkflowMutation = useCreateWorkflow();
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
      checkOcrConfidence: { enabled: true, parameters: { threshold: 0.95 } },
      humanReview: { enabled: true, parameters: { timeout: 86400000 } },
      storeResults: { enabled: true },
    },
  });

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

  const handleCreateWorkflow = async () => {
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

    // Copy only valid step configurations
    const validStepIds = [
      "updateStatus",
      "prepareFileData",
      // biome-ignore lint/security/noSecrets: These are workflow step identifiers, not secrets
      "submitToAzureOCR",
      // biome-ignore lint/security/noSecrets: These are workflow step identifiers, not secrets
      "updateApimRequestId",
      // biome-ignore lint/security/noSecrets: These are workflow step identifiers, not secrets
      "waitBeforePoll",
      "pollOCRResults",
      "extractOCRResults",
      // biome-ignore lint/security/noSecrets: These are workflow step identifiers, not secrets
      "postOcrCleanup",
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
      await createWorkflowMutation.mutateAsync({
        name: workflowName,
        description: workflowDescription || undefined,
        config: workflowStepsConfig,
      });

      notifications.show({
        title: "Success",
        message: `Workflow "${workflowName}" created successfully`,
        color: "green",
      });

      // Reset form
      setWorkflowName("");
      setWorkflowDescription("");
      setConfig({
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
          checkOcrConfidence: {
            enabled: true,
            parameters: { threshold: 0.95 },
          },
          humanReview: { enabled: true, parameters: { timeout: 86400000 } },
          storeResults: { enabled: true },
        },
      });
    } catch (error) {
      notifications.show({
        title: "Error",
        message:
          error instanceof Error ? error.message : "Failed to create workflow",
        color: "red",
      });
    }
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Stack gap={2}>
          <Title order={2}>Create Workflow</Title>
          <Text c="dimmed" size="sm">
            Configure custom OCR processing workflows with step-by-step control
          </Text>
        </Stack>
        <Badge variant="outline" size="lg">
          Workflow Builder
        </Badge>
      </Group>

      <Grid>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="lg">
            <Paper shadow="sm" radius="md" p="lg" withBorder>
              <Stack gap="md">
                <Title order={3}>Basic Information</Title>
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
                        // biome-ignore lint/security/noSecrets: This is a workflow step identifier, not a secret
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
                        // biome-ignore lint/security/noSecrets: This is a workflow step identifier, not a secret
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
                            // biome-ignore lint/security/noSecrets: This is a workflow step identifier, not a secret
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
                              // biome-ignore lint/security/noSecrets: This is a workflow step identifier, not a secret
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
                                // biome-ignore lint/security/noSecrets: This is a workflow step parameter identifier, not a secret
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
                        // biome-ignore lint/security/noSecrets: This is a workflow step identifier, not a secret
                        "postOcrCleanup",
                        e.currentTarget.checked,
                      )
                    }
                  />

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
                          precision={2}
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
                          precision={1}
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

            <Group justify="flex-end">
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={handleCreateWorkflow}
                size="lg"
                loading={createWorkflowMutation.isPending}
              >
                Create Workflow
              </Button>
            </Group>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 24, md: 16, lg: 8, xl: 4 }}>
          <div style={{ position: "sticky", top: "20px" }}>
            <WorkflowVisualization config={config} />
          </div>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
