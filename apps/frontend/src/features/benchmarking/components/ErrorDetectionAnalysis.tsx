import { Card, Center, Loader, Stack, Table, Text, Title } from "@mantine/core";
import { useMemo, useState } from "react";
import type { ErrorDetectionField } from "../api/errorDetectionAnalysis";
import { useErrorDetectionAnalysis } from "../api/errorDetectionAnalysis";

interface Props {
  projectId: string;
  runId: string;
}

function curvePointAt(field: ErrorDetectionField, threshold: number) {
  const idx = Math.max(0, Math.min(100, Math.round(threshold * 100)));
  return field.curve[idx];
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function ErrorDetectionAnalysis({ projectId, runId }: Props) {
  const { analysis, isLoading, error } = useErrorDetectionAnalysis(
    projectId,
    runId,
  );

  // Per-field threshold state: initialized to suggestedBestBalance when data arrives.
  const [thresholds, setThresholds] = useState<Record<string, number>>({});

  // Initialize thresholds from data (once per data load identity).
  const initializedKey = analysis?.runId ?? null;
  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  if (initializedKey && initializedKey !== initializedFor && analysis) {
    const init: Record<string, number> = {};
    for (const f of analysis.fields) {
      init[f.name] = f.suggestedBestBalance;
    }
    setThresholds(init);
    setInitializedFor(initializedKey);
  }

  // Roll-up summary aggregating all fields at current thresholds.
  const rollup = useMemo(() => {
    if (!analysis || analysis.fields.length === 0) return null;
    let totalErrors = 0;
    let totalTp = 0;
    let totalFp = 0;
    let totalEvaluated = 0;
    for (const f of analysis.fields) {
      const t = thresholds[f.name] ?? f.suggestedBestBalance;
      const pt = curvePointAt(f, t);
      totalErrors += f.errorCount;
      totalTp += pt.tp;
      totalFp += pt.fp;
      totalEvaluated += f.evaluatedCount;
    }
    const catchPct =
      totalErrors > 0 ? Math.round((totalTp / totalErrors) * 100) : 0;
    const reviewed = totalTp + totalFp;
    return { totalErrors, totalTp, catchPct, reviewed, totalEvaluated };
  }, [analysis, thresholds]);

  if (isLoading) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }

  if (error) {
    return (
      <Text c="red" py="md">
        Failed to load error detection analysis.
      </Text>
    );
  }

  if (!analysis || analysis.notReady) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        Analysis available once the run completes.
      </Text>
    );
  }

  if (analysis.fields.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No evaluable fields found for this run.
      </Text>
    );
  }

  // Sort fields by error rate descending.
  const sortedFields = [...analysis.fields].sort(
    (a, b) => b.errorRate - a.errorRate,
  );

  const excludedCount = analysis.excludedFields.length;

  return (
    <Stack gap="md">
      <Title order={4}>Error Detection Analysis</Title>

      {/* Roll-up summary */}
      {rollup && (
        <Card withBorder padding="md">
          <Text>
            Catching {rollup.totalTp} of {rollup.totalErrors} errors (
            {rollup.catchPct}%) &mdash; {rollup.reviewed} of{" "}
            {rollup.totalEvaluated} samples flagged for review
          </Text>
        </Card>
      )}

      {/* Field table */}
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Field</Table.Th>
            <Table.Th>Evaluated</Table.Th>
            <Table.Th>Error rate</Table.Th>
            <Table.Th>Threshold</Table.Th>
            <Table.Th>Suggested</Table.Th>
            <Table.Th title="How many real errors the model would catch at this threshold (true positives ÷ total errors). Higher is better for finding problems.">
              Errors caught
            </Table.Th>
            <Table.Th title="How many correct fields would be flagged for review when they are actually fine (false positives). Lower is better to reduce unnecessary review work.">
              False alarms
            </Table.Th>
            <Table.Th>Missed</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sortedFields.map((f) => {
            const t = thresholds[f.name] ?? f.suggestedBestBalance;
            const pt = curvePointAt(f, t);

            const setThreshold = (val: number) =>
              setThresholds((prev) => ({ ...prev, [f.name]: val }));

            return (
              <Table.Tr key={f.name}>
                <Table.Td>{f.name}</Table.Td>
                <Table.Td>{f.evaluatedCount}</Table.Td>
                <Table.Td>{pct(f.errorRate)}</Table.Td>
                <Table.Td>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={t}
                      aria-label={`Threshold for ${f.name}`}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                      style={{ width: 120 }}
                    />
                    <Text size="sm" component="span">
                      {t.toFixed(2)}
                    </Text>
                  </div>
                </Table.Td>
                <Table.Td>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      disabled={f.suggestedCatch90 === null}
                      title={
                        f.suggestedCatch90 === null
                          ? "Not enough error samples to compute a 90% catch threshold"
                          : undefined
                      }
                      onClick={() =>
                        f.suggestedCatch90 !== null &&
                        setThreshold(f.suggestedCatch90)
                      }
                    >
                      Catch 90%
                    </button>
                    <button
                      type="button"
                      onClick={() => setThreshold(f.suggestedBestBalance)}
                    >
                      Best balance
                    </button>
                    <button
                      type="button"
                      disabled={f.suggestedMinimizeReview === null}
                      title={
                        f.suggestedMinimizeReview === null
                          ? "Not enough data to compute a minimize-review threshold"
                          : undefined
                      }
                      onClick={() =>
                        f.suggestedMinimizeReview !== null &&
                        setThreshold(f.suggestedMinimizeReview)
                      }
                    >
                      Minimize review
                    </button>
                  </div>
                </Table.Td>
                <Table.Td>
                  {pt.tp} of {f.errorCount} real errors
                </Table.Td>
                <Table.Td>{pt.fp}</Table.Td>
                <Table.Td>{pt.fn}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>

      {/* Excluded fields footnote */}
      {excludedCount > 0 && (
        <Text size="sm" c="dimmed">
          {excludedCount} field{excludedCount === 1 ? "" : "s"} excluded from
          analysis (no ground truth or confidence data available).
        </Text>
      )}
    </Stack>
  );
}
