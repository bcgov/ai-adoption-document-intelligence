import { useMemo, useState } from "react";
import {
  Center,
  DataTable,
  Loader,
  PanelCard,
  Stack,
  Text,
  Title,
} from "../../../ui";
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
        <PanelCard p="md">
          <Text>
            Catching {rollup.totalTp} of {rollup.totalErrors} errors (
            {rollup.catchPct}%) &mdash; {rollup.reviewed} of{" "}
            {rollup.totalEvaluated} samples flagged for review
          </Text>
        </PanelCard>
      )}

      {/* Field table */}
      <DataTable striped highlightOnHover>
        <DataTable.Thead>
          <DataTable.Tr>
            <DataTable.Th>Field</DataTable.Th>
            <DataTable.Th>Evaluated</DataTable.Th>
            <DataTable.Th>Error rate</DataTable.Th>
            <DataTable.Th>Threshold</DataTable.Th>
            <DataTable.Th>Suggested</DataTable.Th>
            <DataTable.Th title="How many real errors the model would catch at this threshold (true positives ÷ total errors). Higher is better for finding problems.">
              Errors caught
            </DataTable.Th>
            <DataTable.Th title="How many correct fields would be flagged for review when they are actually fine (false positives). Lower is better to reduce unnecessary review work.">
              False alarms
            </DataTable.Th>
            <DataTable.Th>Missed</DataTable.Th>
          </DataTable.Tr>
        </DataTable.Thead>
        <DataTable.Tbody>
          {sortedFields.map((f) => {
            const t = thresholds[f.name] ?? f.suggestedBestBalance;
            const pt = curvePointAt(f, t);

            const setThreshold = (val: number) =>
              setThresholds((prev) => ({ ...prev, [f.name]: val }));

            return (
              <DataTable.Tr key={f.name}>
                <DataTable.Td>{f.name}</DataTable.Td>
                <DataTable.Td>{f.evaluatedCount}</DataTable.Td>
                <DataTable.Td>{pct(f.errorRate)}</DataTable.Td>
                <DataTable.Td>
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
                </DataTable.Td>
                <DataTable.Td>
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
                </DataTable.Td>
                <DataTable.Td>
                  {pt.tp} of {f.errorCount} real errors
                </DataTable.Td>
                <DataTable.Td>{pt.fp}</DataTable.Td>
                <DataTable.Td>{pt.fn}</DataTable.Td>
              </DataTable.Tr>
            );
          })}
        </DataTable.Tbody>
      </DataTable>

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
