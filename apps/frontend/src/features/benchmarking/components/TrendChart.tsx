import {
  Card,
  Center,
  Loader,
  MultiSelect,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { useSessionStorage } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HistoricalRunData, MetricComparison } from "../hooks/useRuns";

interface TrendChartProps {
  historicalRuns: HistoricalRunData[];
  currentRunId: string;
  baselineComparison: { metricComparisons: MetricComparison[] } | null;
  isLoading?: boolean;
}

const METRIC_COLORS = [
  "#228be6", // blue
  "#fd7e14", // orange
  "#51cf66", // green
  "#e64980", // pink
  "#9775fa", // violet
  "#fcc419", // yellow
];

export function TrendChart({
  historicalRuns,
  currentRunId,
  baselineComparison,
  isLoading,
}: TrendChartProps) {
  // Get all available metrics from baseline comparison
  const availableMetrics = useMemo(() => {
    if (!baselineComparison) return [];
    return baselineComparison.metricComparisons.map((c) => c.metricName);
  }, [baselineComparison]);

  // State for selected metrics (default to first 2 metrics if available)
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);

  // State for date range (default to "Last 20 runs") - persisted in session storage
  const [dateRange, setDateRange] = useSessionStorage({
    key: "regression-report-date-range",
    defaultValue: "last_20",
  });

  // State for toggled metrics (metrics hidden by user clicking legend)
  const [hiddenMetrics, setHiddenMetrics] = useState<Set<string>>(new Set());

  // Initialize selected metrics when available metrics change - start with first metric only
  useEffect(() => {
    if (availableMetrics.length > 0 && selectedMetrics.length === 0) {
      setSelectedMetrics([availableMetrics[0]]);
    }
  }, [availableMetrics, selectedMetrics.length]);

  // Filter and sort runs based on date range
  const filteredRuns = useMemo(() => {
    const completedRuns = historicalRuns.filter(
      (run) => run.status === "completed" && run.completedAt,
    );

    // Sort by completion date (oldest first for chart display)
    const sorted = [...completedRuns].sort(
      (a, b) =>
        new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime(),
    );

    // Apply date range filter
    if (dateRange === "last_10") {
      return sorted.slice(-10);
    } else if (dateRange === "last_20") {
      return sorted.slice(-20);
    } else if (dateRange === "last_30_days") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return sorted.filter(
        (run) => new Date(run.completedAt!) >= thirtyDaysAgo,
      );
    } else if (dateRange === "last_90_days") {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      return sorted.filter(
        (run) => new Date(run.completedAt!) >= ninetyDaysAgo,
      );
    } else {
      // "all" - return all sorted runs
      return sorted;
    }
  }, [historicalRuns, dateRange]);

  // Prepare chart data
  const chartData = useMemo(() => {
    return filteredRuns.map((run) => {
      const dataPoint: Record<string, unknown> = {
        runId: run.id,
        date: run.completedAt
          ? new Date(run.completedAt).toLocaleDateString()
          : "",
        isCurrentRun: run.id === currentRunId,
        isBaseline: run.isBaseline,
      };

      // Add metric values
      selectedMetrics.forEach((metricName) => {
        dataPoint[metricName] = run.metrics[metricName] ?? null;
      });

      return dataPoint;
    });
  }, [filteredRuns, selectedMetrics, currentRunId]);

  // Get threshold values for selected metrics
  const thresholds = useMemo(() => {
    if (!baselineComparison) return {};
    const thresholdMap: Record<string, number | null> = {};
    baselineComparison.metricComparisons.forEach((comparison) => {
      if (
        comparison.threshold &&
        selectedMetrics.includes(comparison.metricName)
      ) {
        // Calculate threshold value based on baseline value and threshold
        if (comparison.threshold.type === "relative") {
          thresholdMap[comparison.metricName] =
            comparison.baselineValue * (1 - comparison.threshold.value / 100);
        } else {
          // absolute
          thresholdMap[comparison.metricName] =
            comparison.baselineValue - comparison.threshold.value;
        }
      }
    });
    return thresholdMap;
  }, [baselineComparison, selectedMetrics]);

  const handleMetricSelection = (values: string[]) => {
    if (values.length > 0) {
      setSelectedMetrics(values);
    }
  };

  const handleLegendClick = (metricName: string) => {
    const newHidden = new Set(hiddenMetrics);
    if (newHidden.has(metricName)) {
      newHidden.delete(metricName);
    } else {
      newHidden.add(metricName);
    }
    setHiddenMetrics(newHidden);
  };

  // Custom dot to highlight current run
  const CustomDot = (props: {
    cx: number;
    cy: number;
    payload: { isCurrentRun?: boolean };
    dataKey: string;
  }) => {
    const { cx, cy, payload, dataKey } = props;
    if (payload.isCurrentRun && dataKey !== "date") {
      return (
        <circle
          cx={cx}
          cy={cy}
          r={6}
          fill="#e64980"
          stroke="#fff"
          strokeWidth={2}
          data-testid="current-run-marker"
          data-run-id={payload.isCurrentRun ? currentRunId : undefined}
        />
      );
    }
    return (
      <circle
        cx={cx}
        cy={cy}
        r={3}
        fill="currentColor"
        className="data-point"
        data-testid="data-point"
      />
    );
  };

  // Custom legend with click handlers
  const CustomLegend = () => {
    return (
      <div
        data-testid="chart-legend"
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 16,
          marginTop: 16,
          flexWrap: "wrap",
        }}
      >
        {selectedMetrics.map((metricName, index) => {
          const isHidden = hiddenMetrics.has(metricName);
          const color = METRIC_COLORS[index % METRIC_COLORS.length];
          return (
            <div
              key={metricName}
              data-testid={`legend-item-${metricName}`}
              onClick={() => handleLegendClick(metricName)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                opacity: isHidden ? 0.5 : 1,
                textDecoration: isHidden ? "line-through" : "none",
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 3,
                  backgroundColor: color,
                  borderRadius: 2,
                }}
              />
              <Text size="sm" component="span">
                {metricName}
              </Text>
            </div>
          );
        })}
      </div>
    );
  };

  // Custom tooltip
  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
  }) => {
    if (active && payload?.length) {
      return (
        <Card
          data-testid="chart-tooltip"
          shadow="md"
          padding="sm"
          style={{ minWidth: 200 }}
        >
          <Stack gap="xs">
            {payload.map((entry) => (
              <div key={entry.name}>
                <Text size="sm" fw={500}>
                  {entry.name}
                </Text>
                <Text size="sm" c="dimmed">
                  {entry.value.toFixed(4)}
                </Text>
              </div>
            ))}
          </Stack>
        </Card>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  if (filteredRuns.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No completed runs available for trend visualization
      </Text>
    );
  }

  const dateRangeLabel =
    dateRange === "last_10"
      ? "Last 10 runs"
      : dateRange === "last_20"
        ? "Last 20 runs"
        : dateRange === "last_30_days"
          ? "Last 30 days"
          : dateRange === "last_90_days"
            ? "Last 90 days"
            : "All runs";

  return (
    <Stack gap="md">
      <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
        <MultiSelect
          data-testid="metric-selector"
          label="Select Metrics"
          placeholder="Choose metrics to visualize"
          data={availableMetrics}
          value={selectedMetrics}
          onChange={handleMetricSelection}
          searchable
          clearable={false}
          style={{ flex: 1 }}
        />
        <Select
          data-testid="date-range-selector"
          label="Date Range"
          value={dateRange}
          onChange={(value) => setDateRange(value || "last_20")}
          data={[
            { value: "last_10", label: "Last 10 runs" },
            { value: "last_20", label: "Last 20 runs" },
            { value: "last_30_days", label: "Last 30 days" },
            { value: "last_90_days", label: "Last 90 days" },
            { value: "all", label: "All runs" },
          ]}
          style={{ width: 200 }}
        />
      </div>

      <Text size="sm" c="dimmed" data-testid="date-range-label">
        Showing {dateRangeLabel.toLowerCase()} ({filteredRuns.length} run
        {filteredRuns.length !== 1 ? "s" : ""})
      </Text>

      <div data-testid="trend-chart">
        <ResponsiveContainer width="100%" height={400}>
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              label={{
                value: "Metric Value",
                angle: -90,
                position: "insideLeft",
              }}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Render threshold lines */}
            {Object.entries(thresholds).map(([metricName, thresholdValue]) => {
              if (thresholdValue !== null && !hiddenMetrics.has(metricName)) {
                return (
                  <ReferenceLine
                    key={`threshold-${metricName}`}
                    y={thresholdValue}
                    stroke="#ff6b6b"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    data-testid="threshold-line"
                    label={{
                      value: `${metricName} threshold`,
                      fontSize: 11,
                      fill: "#ff6b6b",
                    }}
                  />
                );
              }
              return null;
            })}

            {/* Render metric lines */}
            {selectedMetrics.map((metricName, index) => {
              const isHidden = hiddenMetrics.has(metricName);
              const color = METRIC_COLORS[index % METRIC_COLORS.length];
              return (
                <Line
                  key={metricName}
                  type="monotone"
                  dataKey={metricName}
                  stroke={color}
                  strokeWidth={2}
                  strokeOpacity={isHidden ? 0 : 1}
                  dot={
                    <CustomDot
                      dataKey={metricName}
                      cx={0}
                      cy={0}
                      payload={{}}
                    />
                  }
                  activeDot={{ r: 6 }}
                  className={`trend-line-${metricName}`}
                  hide={isHidden}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <CustomLegend />
    </Stack>
  );
}
