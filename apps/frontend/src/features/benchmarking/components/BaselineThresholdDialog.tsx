import {
  Alert,
  Button,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useEffect, useState } from "react";

interface MetricThreshold {
  metricName: string;
  type: "absolute" | "relative";
  value: number;
}

interface BaselineThresholdDialogProps {
  opened: boolean;
  onClose: () => void;
  metrics: Record<string, number>;
  onSubmit: (thresholds: MetricThreshold[]) => void;
  isPromoting: boolean;
  existingBaseline?: {
    runId: string;
    definitionName: string;
  };
  existingThresholds?: MetricThreshold[];
  isEditing?: boolean;
}

export function BaselineThresholdDialog({
  opened,
  onClose,
  metrics,
  onSubmit,
  isPromoting,
  existingBaseline,
  existingThresholds,
  isEditing = false,
}: BaselineThresholdDialogProps) {
  const metricNames = Object.keys(metrics);

  // Initialize thresholds with existing values if editing, otherwise use defaults
  const initializeThresholds = (): MetricThreshold[] => {
    if (existingThresholds && existingThresholds.length > 0) {
      return existingThresholds;
    }
    return metricNames.map((name) => ({
      metricName: name,
      type: "relative" as const,
      value: 0.95,
    }));
  };

  const [thresholds, setThresholds] = useState<MetricThreshold[]>(
    initializeThresholds(),
  );

  // Reset thresholds when dialog opens
  useEffect(() => {
    if (opened) {
      setThresholds(initializeThresholds());
      setErrors({});
    }
  }, [opened, existingThresholds]);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateThreshold = (type: string, value: number): string | null => {
    if (Number.isNaN(value)) {
      return "Must be a valid number";
    }

    if (type === "relative") {
      if (value < 0 || value > 1) {
        return "Threshold must be between 0 and 1";
      }
    } else {
      if (value < 0) {
        return "Threshold must be non-negative";
      }
    }

    return null;
  };

  const handleThresholdChange = (
    metricName: string,
    field: "type" | "value",
    newValue: string | number,
  ) => {
    setThresholds((prev) =>
      prev.map((t) =>
        t.metricName === metricName
          ? { ...t, [field]: field === "value" ? Number(newValue) : newValue }
          : t,
      ),
    );

    // Clear error for this metric
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[metricName];
      return newErrors;
    });
  };

  const handleSubmit = () => {
    // Validate all thresholds
    const newErrors: Record<string, string> = {};
    thresholds.forEach((t) => {
      const error = validateThreshold(t.type, t.value);
      if (error) {
        newErrors[t.metricName] = error;
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSubmit(thresholds);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        isEditing ? "Edit Baseline Thresholds" : "Configure Baseline Thresholds"
      }
      size="lg"
      data-testid="baseline-threshold-dialog"
    >
      <Stack gap="md">
        {existingBaseline && !isEditing && (
          <Alert
            color="yellow"
            icon={<IconAlertCircle size={16} />}
            data-testid="existing-baseline-warning"
          >
            <Text size="sm" fw={600}>
              Existing baseline will be demoted
            </Text>
            <Text size="sm">
              The current baseline run for "{existingBaseline.definitionName}"
              will be demoted. This run will become the new baseline.
            </Text>
          </Alert>
        )}

        <Text size="sm" c="dimmed">
          {isEditing
            ? "Update threshold limits for each metric. Future runs will be compared against these thresholds to detect regressions."
            : "Set threshold limits for each metric. Future runs will be compared against these thresholds to detect regressions."}
        </Text>

        <Stack gap="sm">
          {thresholds.map((threshold) => {
            const currentValue = metrics[threshold.metricName];
            const formattedValue =
              typeof currentValue === "number"
                ? currentValue.toFixed(4)
                : "N/A";
            return (
              <Stack key={threshold.metricName} gap="xs">
                <Text size="sm" fw={500}>
                  {threshold.metricName}
                  <Text span c="dimmed" ml="xs">
                    (current: {formattedValue})
                  </Text>
                </Text>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Select
                    data={[
                      { value: "relative", label: "Relative (%)" },
                      { value: "absolute", label: "Absolute" },
                    ]}
                    value={threshold.type}
                    onChange={(value) =>
                      handleThresholdChange(
                        threshold.metricName,
                        "type",
                        value || "relative",
                      )
                    }
                    style={{ width: "140px" }}
                    data-testid={`threshold-type-${threshold.metricName}`}
                  />
                  <TextInput
                    type="number"
                    step={threshold.type === "relative" ? "0.01" : "0.001"}
                    min="0"
                    max={threshold.type === "relative" ? "1" : undefined}
                    value={threshold.value}
                    onChange={(e) =>
                      handleThresholdChange(
                        threshold.metricName,
                        "value",
                        e.currentTarget.value,
                      )
                    }
                    error={errors[threshold.metricName]}
                    style={{ flex: 1 }}
                    data-testid={`threshold-value-${threshold.metricName}`}
                    description={
                      threshold.type === "relative"
                        ? `Must not drop below ${(threshold.value * 100).toFixed(0)}% of baseline`
                        : `Must not drop below ${threshold.value}`
                    }
                  />
                </div>
              </Stack>
            );
          })}
        </Stack>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.5rem",
            marginTop: "1rem",
          }}
        >
          <Button
            variant="default"
            onClick={onClose}
            disabled={isPromoting}
            data-testid="cancel-threshold-btn"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={isPromoting}
            data-testid="submit-threshold-btn"
          >
            {isEditing ? "Update Thresholds" : "Promote to Baseline"}
          </Button>
        </div>
      </Stack>
    </Modal>
  );
}
