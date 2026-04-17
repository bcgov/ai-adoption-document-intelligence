import {
  Button,
  Code,
  FileInput,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { useClassifier } from "@/data/hooks/useClassifier";
import { ClassifierModel } from "@/shared/types/classifier";
import { dropzoneAccept } from "@/shared/utils/upload";

interface ClassifierAccessProps {
  model: ClassifierModel;
}

const ClassifierAccess = ({ model }: ClassifierAccessProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operationLocation, setOperationLocation] = useState<string | null>(
    null,
  );
  const [polling, setPolling] = useState(false);
  const { requestClassification, fetchClassificationResult } = useClassifier();

  // Use a ref to track polling attempts
  const attemptsRef = useRef(0);

  // Use the hook version for polling, just like ClassifierPage
  // const classificationResultQuery = useClassifier().getClassificationResult(operationLocation || "");

  async function handleSubmit() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setOperationLocation(null);
    attemptsRef.current = 0;
    try {
      const response = await requestClassification.mutateAsync({
        file,
        name: model.name,
        group_id: model.group_id,
      });
      if (response && response.content) {
        setOperationLocation(response.content);
        setPolling(true);
      } else {
        setError("No operation location returned");
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Unknown error");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    let cancelled = false;
    async function poll() {
      if (!polling || !operationLocation) return;
      try {
        const res = await fetchClassificationResult(operationLocation);
        if (cancelled) return;
        if (res.status === "succeeded") {
          setResult(JSON.stringify(res.analyzeResult, null, 2));
          setPolling(false);
        } else if (res.status === "failed") {
          setError("Classification failed");
          setPolling(false);
        } else if (attemptsRef.current < 20) {
          attemptsRef.current++;
          timeout = setTimeout(poll, 5000);
        } else if (attemptsRef.current >= 20) {
          setError("Timed out waiting for classification result.");
          setPolling(false);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          if (e instanceof Error) {
            setError(e.message);
          } else {
            setError("Unknown error");
          }
          setPolling(false);
        }
      }
    }
    if (polling && operationLocation) {
      poll();
    }
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [polling, operationLocation]);

  return (
    <Paper shadow="xs" radius="md" p="md" withBorder>
      <Stack>
        <Title order={2}>Classifier Test</Title>
        <Text c="dimmed">
          This classifier is ready for use. Upload a document to test it below.
        </Text>
        <FileInput
          label="Upload document for testing"
          accept={Object.keys(dropzoneAccept).join(",")}
          placeholder="Select a file (PDF or image)"
          value={file}
          onChange={setFile}
          disabled={loading || polling}
          required
          style={{ width: "50%" }}
        />
        <Group>
          <Button
            onClick={handleSubmit}
            loading={loading || polling}
            disabled={!file || loading || polling}
          >
            Submit for Classification
          </Button>
        </Group>
        {error && (
          <Text c="red" size="sm">
            {error}
          </Text>
        )}
        {result && (
          <Paper shadow="xs" radius="md" p="md" withBorder>
            <Text fw={500} mb={4}>
              Classification Analyze Result:
            </Text>
            <Code block style={{ width: "100%", whiteSpace: "pre-wrap" }}>
              {result}
            </Code>
          </Paper>
        )}
      </Stack>
    </Paper>
  );
};

export default ClassifierAccess;
