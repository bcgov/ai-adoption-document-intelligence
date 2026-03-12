import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { useDocumentApproval } from "../../data/hooks/useDocumentApproval";
import type { Document, OcrResult } from "../../shared/types";
import { RejectionReason } from "../../shared/types";

interface DocumentValidationProps {
  document: Document;
  ocrResult: OcrResult;
  onValidationComplete?: () => void;
}

export function DocumentValidation({
  document,
  ocrResult,
  onValidationComplete,
}: DocumentValidationProps) {
  const [comments, setComments] = useState("");
  const [rejectionReason, setRejectionReason] =
    useState<RejectionReason | null>(null);
  const [annotations, setAnnotations] = useState("");
  const [selectedAction, setSelectedAction] = useState<
    "approve" | "reject" | null
  >(null);
  const approvalMutation = useDocumentApproval();

  const handleApprove = async () => {
    setSelectedAction("approve");
    try {
      await approvalMutation.mutateAsync({
        documentId: document.id,
        approved: true,
        comments: comments.trim() || undefined,
      });
      onValidationComplete?.();
    } catch (_error) {
      // Error is handled by the mutation's error state
    }
  };

  const handleReject = async () => {
    if (!rejectionReason) {
      // Show error - rejection reason is required
      return;
    }
    setSelectedAction("reject");
    try {
      await approvalMutation.mutateAsync({
        documentId: document.id,
        approved: false,
        comments: comments.trim() || undefined,
        rejectionReason: rejectionReason,
        annotations: annotations.trim() || undefined,
      });
      onValidationComplete?.();
    } catch (_error) {
      // Error is handled by the mutation's error state
    }
  };

  // Calculate average confidence from key-value pairs
  const keyValuePairs = ocrResult.keyValuePairs || {};
  const keyValuePairsArray = Object.values(keyValuePairs);
  const averageConfidence =
    keyValuePairsArray.length > 0
      ? keyValuePairsArray.reduce(
          (sum, kvp) => sum + (kvp.confidence || 0),
          0,
        ) / keyValuePairsArray.length
      : 0;

  const confidencePercentage = Math.round(averageConfidence * 100);
  const confidenceColor =
    confidencePercentage >= 90
      ? "green"
      : confidencePercentage >= 70
        ? "yellow"
        : "red";

  const isProcessing = approvalMutation.isPending;

  return (
    <Paper shadow="sm" radius="md" p="lg" withBorder>
      <Stack gap="md">
        <div>
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={4}>Document Validation Required</Title>
              <Text size="sm" c="dimmed" mt={4}>
                This document has low OCR confidence and requires human review
              </Text>
            </div>
            <Badge color={confidenceColor} size="lg" variant="light">
              {confidencePercentage}% Confidence
            </Badge>
          </Group>
        </div>

        <Alert
          icon={<IconAlertTriangle size={16} />}
          title="Review Required"
          color="orange"
          variant="light"
        >
          The OCR confidence score is below the threshold (95%). Please review
          the extracted data and either approve or reject the results.
        </Alert>

        <div>
          <Text size="sm" fw={600} mb="xs">
            Extracted Text Preview:
          </Text>
          <Paper
            p="sm"
            withBorder
            style={{
              maxHeight: "200px",
              overflow: "auto",
              backgroundColor: "#f8f9fa",
            }}
          >
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
              {document.extracted_data?.content ||
                keyValuePairsArray
                  .map((kvp) => kvp.content)
                  .filter(Boolean)
                  .join(" ") ||
                "No text extracted"}
            </Text>
          </Paper>
        </div>

        {keyValuePairsArray.length > 0 && (
          <div>
            <Text size="sm" fw={600} mb="xs">
              Key-Value Pairs ({keyValuePairsArray.length}):
            </Text>
            <Paper
              p="sm"
              withBorder
              style={{ maxHeight: "200px", overflow: "auto" }}
            >
              <Stack gap="xs">
                {Object.entries(keyValuePairs).map(([key, kvp]) => (
                  <div key={key}>
                    <Group gap="xs" align="flex-start">
                      <Badge
                        color={
                          (kvp.confidence || 0) >= 0.9
                            ? "green"
                            : (kvp.confidence || 0) >= 0.7
                              ? "yellow"
                              : "red"
                        }
                        size="sm"
                        variant="light"
                      >
                        {Math.round((kvp.confidence || 0) * 100)}%
                      </Badge>
                      <div style={{ flex: 1 }}>
                        <Text size="sm" fw={600}>
                          {key}
                        </Text>
                        {kvp.content && (
                          <Text size="xs" c="dimmed">
                            {kvp.content}
                          </Text>
                        )}
                      </div>
                    </Group>
                  </div>
                ))}
              </Stack>
            </Paper>
          </div>
        )}

        <div>
          <Text size="sm" fw={600} mb="xs">
            Review Comments (Optional):
          </Text>
          <Textarea
            placeholder="Add any comments about the OCR results..."
            value={comments}
            onChange={(e) => setComments(e.currentTarget.value)}
            minRows={3}
            disabled={isProcessing}
          />
        </div>

        <div>
          <Text size="sm" fw={600} mb="xs">
            Rejection Reason{" "}
            <Text span c="red">
              *
            </Text>{" "}
            (Required if rejecting):
          </Text>
          <Select
            placeholder="Select a rejection reason"
            data={[
              {
                value: RejectionReason.INPUT_QUALITY,
                label: "❌ Input Quality (scan unreadable, cutoff, skew)",
              },
              {
                value: RejectionReason.OCR_FAILURE,
                label: "❌ OCR Failure (missing fields, hallucinations)",
              },
              {
                value: RejectionReason.MODEL_MISMATCH,
                label: "❌ Model Mismatch (wrong document type/template)",
              },
              {
                value: RejectionReason.CONFIDENCE_TOO_LOW,
                label: "❌ Confidence Too Low (too low to trust)",
              },
              {
                value: RejectionReason.SYSTEMIC_ERROR,
                label: "❌ Systemic Error (pipeline bug)",
              },
            ]}
            value={rejectionReason || null}
            onChange={(value) =>
              setRejectionReason(value as RejectionReason | null)
            }
            disabled={isProcessing}
            mb="xs"
            searchable
            comboboxProps={{ zIndex: 10000 }}
          />
        </div>

        <div>
          <Text size="sm" fw={600} mb="xs">
            Annotations (Optional):
          </Text>
          <Textarea
            placeholder="What failed, where, why? (e.g., 'Field X is missing on page 2', 'OCR hallucinated text in section Y')"
            value={annotations}
            onChange={(e) => setAnnotations(e.currentTarget.value)}
            minRows={3}
            disabled={isProcessing}
          />
          <Text size="xs" c="dimmed" mt={4}>
            Optional: Provide specific details about what failed, where it
            occurred, and why it was rejected.
          </Text>
        </div>

        {approvalMutation.isError && (
          <Alert color="red" title="Error">
            {approvalMutation.error instanceof Error
              ? approvalMutation.error.message
              : "Failed to submit approval"}
          </Alert>
        )}

        <Group justify="flex-end" gap="sm">
          <Button
            variant="outline"
            color="red"
            leftSection={<IconX size={16} />}
            onClick={handleReject}
            loading={isProcessing && selectedAction === "reject"}
            disabled={isProcessing || !rejectionReason}
          >
            Reject
          </Button>
          <Button
            color="green"
            leftSection={<IconCheck size={16} />}
            onClick={handleApprove}
            loading={isProcessing && selectedAction === "approve"}
            disabled={isProcessing}
          >
            Approve
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
