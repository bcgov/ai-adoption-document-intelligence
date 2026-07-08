import {
  IconCurrencyDollar,
  IconLock,
  IconLockOpen,
} from "@tabler/icons-react";
import { type JSX, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../auth/AuthContext";
import { useGroup } from "../auth/GroupContext";
import {
  useGroupBillingConfig,
  useSetBillingCap,
} from "../data/hooks/useBillingConfig";
import type {
  GroupActivityHistoryItem,
  GroupUsageHistoryItem,
  RateVersion,
} from "../data/hooks/useUsageQuery";
import {
  useGroupActivityHistory,
  useGroupUsageHistory,
  useGroupUsageSummary,
  useRateVersionActivityCosts,
  useRateVersions,
} from "../data/hooks/useUsageQuery";
import {
  Badge,
  Button,
  Group,
  Loader,
  NumberInput,
  notifications,
  PageHeader,
  PanelCard,
  Progress,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from "../ui";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function periodKey(row: GroupUsageHistoryItem): string {
  return `${row.period_year}-${row.period_month}`;
}

function formatPeriod(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

function PeriodSummary({
  label,
  units,
  dollars,
}: {
  label: string;
  units: number;
  dollars: number;
}) {
  return (
    <Group gap="xl">
      <div>
        <Text size="xs" c="dimmed">
          Period
        </Text>
        <Text fw={600}>{label}</Text>
      </div>
      <div>
        <Text size="xs" c="dimmed">
          Units consumed
        </Text>
        <Text fw={600}>{units.toLocaleString()}</Text>
      </div>
      <div>
        <Text size="xs" c="dimmed">
          Amount spent
        </Text>
        <Text fw={600}>${dollars.toFixed(4)}</Text>
      </div>
    </Group>
  );
}

/** Fixed color palette for activity bars (cycles if more than 8 activities). */
const ACTIVITY_COLORS = [
  "#228be6",
  "#40c057",
  "#fab005",
  "#fd7014",
  "#ae3ec9",
  "#f03e3e",
  "#15aabf",
  "#74c0fc",
];

function activityColor(index: number): string {
  return ACTIVITY_COLORS[index % ACTIVITY_COLORS.length];
}

/**
 * Stacked bar chart showing per-activity spend by month.
 * Each activity name gets its own color segment within each period bar.
 */
function ActivitySpendChart({
  activityHistory,
}: {
  activityHistory: GroupActivityHistoryItem[];
}) {
  const { data, activities } = useMemo(() => {
    if (activityHistory.length === 0) return { data: [], activities: [] };

    // Collect unique activity names (sorted)
    const activitySet = new Set(activityHistory.map((r) => r.event_type));
    const sortedActivities = [...activitySet].sort();

    // Build one row per period
    const periodMap = new Map<
      string,
      { label: string; [key: string]: number | string }
    >();
    for (const row of activityHistory) {
      const key = `${row.period_year}-${String(row.period_month).padStart(2, "0")}`;
      const label = `${MONTH_NAMES[row.period_month - 1]} ${row.period_year}`;
      if (!periodMap.has(key)) {
        periodMap.set(key, { label });
      }
      const entry = periodMap.get(key)!;
      entry[row.event_type] = Number(row.dollars_spent.toFixed(6));
    }

    const sortedData = [...periodMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);

    return { data: sortedData, activities: sortedActivities };
  }, [activityHistory]);

  if (data.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No billing data available to chart.
      </Text>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `$${v}`}
          width={52}
        />
        <Tooltip
          formatter={(value: unknown, name: unknown) =>
            [`$${(value as number).toFixed(4)}`, String(name)] as [
              string,
              string,
            ]
          }
          labelStyle={{ fontWeight: 600 }}
        />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
        {activities.map((activity, idx) => (
          <Bar
            key={activity}
            dataKey={(entry: {
              label: string;
              [key: string]: number | string;
            }) => (entry[activity] as number) ?? 0}
            name={activity}
            stackId="spend"
            fill={activityColor(idx)}
            radius={idx === activities.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Group spending section — period selector, chart, and table. */
function GroupSpendingView() {
  const { activeGroup } = useGroup();
  const groupId = activeGroup?.id ?? "";
  const [selectedPeriod, setSelectedPeriod] = useState<string>("all");

  const { data: history, isLoading } = useGroupUsageHistory(groupId);
  const { data: activityHistory } = useGroupActivityHistory(groupId);

  const periodOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [
      { value: "all", label: "All Time" },
    ];
    if (history) {
      for (const row of history) {
        const key = periodKey(row);
        opts.push({ value: key, label: formatPeriod(key) });
      }
    }
    return opts;
  }, [history]);

  const summary = useMemo(() => {
    if (!history) return null;
    if (selectedPeriod === "all") {
      return {
        label: "All Time",
        units: history.reduce((s, r) => s + r.total_units_consumed, 0),
        dollars: history.reduce((s, r) => s + r.total_dollars_spent, 0),
      };
    }
    const row = history.find((r) => periodKey(r) === selectedPeriod);
    if (!row) return null;
    return {
      label: formatPeriod(selectedPeriod),
      units: row.total_units_consumed,
      dollars: row.total_dollars_spent,
    };
  }, [history, selectedPeriod]);

  const visibleHistory = useMemo(() => {
    if (!history) return [];
    if (selectedPeriod === "all") return history;
    return history.filter((r) => periodKey(r) === selectedPeriod);
  }, [history, selectedPeriod]);

  return (
    <Stack gap="md">
      {!groupId ? (
        <Text size="sm" c="dimmed">
          No active group selected.
        </Text>
      ) : isLoading ? (
        <Loader size="sm" />
      ) : (
        <>
          {summary && (
            <PeriodSummary
              label={summary.label}
              units={summary.units}
              dollars={summary.dollars}
            />
          )}

          {activityHistory && activityHistory.length > 0 && (
            <ActivitySpendChart activityHistory={activityHistory} />
          )}

          <Select
            label="Period"
            data={periodOptions}
            value={selectedPeriod}
            onChange={(v) => setSelectedPeriod(v ?? "all")}
            maw={200}
            data-testid="billing-period-select"
          />

          {visibleHistory.length === 0 ? (
            <Text size="sm" c="dimmed">
              No billing history available yet.
            </Text>
          ) : (
            <Table striped highlightOnHover withTableBorder maw={520}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Period</Table.Th>
                  <Table.Th>Units consumed</Table.Th>
                  <Table.Th>Amount spent</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visibleHistory.map((row) => (
                  <Table.Tr key={`${row.period_year}-${row.period_month}`}>
                    <Table.Td>
                      {MONTH_NAMES[row.period_month - 1]} {row.period_year}
                    </Table.Td>
                    <Table.Td>
                      {row.total_units_consumed.toLocaleString()}
                    </Table.Td>
                    <Table.Td>${row.total_dollars_spent.toFixed(4)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </>
      )}
    </Stack>
  );
}

/** Spending cap section — monthly cap management for the active group. */
function SpendingCapView({ isSystemAdmin }: { isSystemAdmin: boolean }) {
  const { activeGroup } = useGroup();
  const groupId = activeGroup?.id ?? "";
  const [editingCap, setEditingCap] = useState(false);
  const [capValue, setCapValue] = useState<number | "">("");

  const { data: config } = useGroupBillingConfig(groupId);
  const { data: currentSummary } = useGroupUsageSummary(groupId);
  const setBillingCap = useSetBillingCap(groupId);

  const currentCap = config?.monthly_cap_dollars ?? null;

  const capPercent =
    currentSummary?.monthly_cap_dollars &&
    currentSummary.monthly_cap_dollars > 0
      ? Math.min(
          100,
          Math.round(
            (currentSummary.total_dollars_spent /
              currentSummary.monthly_cap_dollars) *
              100,
          ),
        )
      : null;

  const handleStartEdit = () => {
    setCapValue(currentCap ?? "");
    setEditingCap(true);
  };

  const handleCancelEdit = () => setEditingCap(false);

  const handleSaveCap = () => {
    const monthly_cap_dollars = capValue === "" ? null : Number(capValue);
    setBillingCap.mutate(
      { monthly_cap_dollars },
      {
        onSuccess: () => {
          notifications.show({
            title: "Spending cap updated",
            message:
              monthly_cap_dollars !== null
                ? `Monthly cap set to $${monthly_cap_dollars.toFixed(2)}.`
                : "Monthly cap removed. Group can spend without restriction.",
            color: "green",
          });
          setEditingCap(false);
        },
        onError: (err) => {
          notifications.show({
            title: "Failed to update spending cap",
            message: err.message ?? "Please try again.",
            color: "red",
          });
        },
      },
    );
  };

  const handleRemoveCap = () => {
    setBillingCap.mutate(
      { monthly_cap_dollars: null },
      {
        onSuccess: () => {
          notifications.show({
            title: "Spending cap removed",
            message:
              "Monthly cap removed. Group can spend without restriction.",
            color: "green",
          });
          setEditingCap(false);
        },
        onError: (err) => {
          notifications.show({
            title: "Failed to remove spending cap",
            message: err.message ?? "Please try again.",
            color: "red",
          });
        },
      },
    );
  };

  return (
    <Stack gap="md" w={"100%"}>
      {!groupId ? (
        <Text size="sm" c="dimmed">
          No active group selected.
        </Text>
      ) : (
        <Stack gap="sm">
          <Text size="xs" c="dimmed">
            Limits the total dollars this group can spend in a calendar month.
            Groups without a cap can spend without restriction.
          </Text>

          {capPercent !== null && (
            <Stack gap={4} maw={500}>
              <Progress
                value={capPercent}
                color={
                  capPercent >= 90
                    ? "red"
                    : capPercent >= 75
                      ? "orange"
                      : "blue"
                }
                size="sm"
              />
              <Text size="xs" c="dimmed">
                {capPercent}% of $
                {currentSummary?.monthly_cap_dollars?.toFixed(2)} cap used this
                month
              </Text>
            </Stack>
          )}

          {!editingCap ? (
            <Group align="center">
              {currentCap !== null ? (
                <>
                  <IconLock size={16} />
                  <Badge color="blue" variant="light" size="lg">
                    ${currentCap.toFixed(2)} / month
                  </Badge>
                </>
              ) : (
                <>
                  <IconLockOpen size={16} />
                  <Badge color="gray" variant="light" size="lg">
                    Unlimited
                  </Badge>
                </>
              )}
              {isSystemAdmin && (
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={handleStartEdit}
                  data-testid="billing-edit-cap-btn"
                >
                  {currentCap !== null ? "Change cap" : "Set cap"}
                </Button>
              )}
            </Group>
          ) : (
            <Stack gap="sm" maw={360}>
              <NumberInput
                label="Monthly cap (CAD)"
                description="Leave blank to remove the cap."
                placeholder="e.g. 500"
                leftSection={<IconCurrencyDollar size={16} />}
                min={0}
                decimalScale={2}
                value={capValue}
                onChange={(v) => setCapValue(v as number | "")}
                data-testid="billing-cap-input"
              />
              <Group gap="xs">
                <Button
                  size="xs"
                  onClick={handleSaveCap}
                  loading={setBillingCap.isPending}
                  data-testid="billing-save-cap-btn"
                >
                  Save
                </Button>
                {currentCap !== null && (
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    onClick={handleRemoveCap}
                    loading={setBillingCap.isPending}
                    data-testid="billing-remove-cap-btn"
                  >
                    Remove cap
                  </Button>
                )}
                <Button
                  size="xs"
                  variant="default"
                  onClick={handleCancelEdit}
                  data-testid="billing-cancel-cap-btn"
                >
                  Cancel
                </Button>
              </Group>
            </Stack>
          )}

          {config?.cap_configured_by && (
            <Text size="xs" c="dimmed" mt="xs">
              Last configured by {config.cap_configured_by}
              {config.cap_configured_at
                ? ` on ${new Date(config.cap_configured_at).toLocaleDateString()}`
                : ""}
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
}

/** Activity costs table for a single rate version — always visible, no accordion. */
function ActivityCostsTable({ versionId }: { versionId: string }) {
  const { data: costs, isLoading } = useRateVersionActivityCosts(versionId);

  if (isLoading) return <Loader size="sm" mt="xs" />;
  if (!costs || costs.length === 0)
    return (
      <Text size="sm" c="dimmed" mt="xs">
        No activity costs defined.
      </Text>
    );

  return (
    <Table striped withTableBorder mt="sm" fz="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Activity</Table.Th>
          <Table.Th>Cost type</Table.Th>
          <Table.Th>Units</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {costs.map((ac) => (
          <Table.Tr key={ac.id}>
            <Table.Td>
              <Text size="sm" ff="monospace">
                {ac.activity_name}
              </Text>
            </Table.Td>
            <Table.Td>
              <Badge
                variant="light"
                color={ac.cost_type === "per_page" ? "violet" : "blue"}
                size="sm"
              >
                {ac.cost_type}
              </Badge>
            </Table.Td>
            <Table.Td>{ac.units}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/** Rate versions section: flat display, activity costs always visible inline. */
function RateVersionsView() {
  const { data: versions, isLoading } = useRateVersions();

  if (isLoading) return <Loader size="sm" />;
  if (!versions || versions.length === 0)
    return (
      <Text size="sm" c="dimmed">
        No rate versions found.
      </Text>
    );

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Rate versions define the billing cost per activity. New versions become
        active automatically on their effective date.
      </Text>
      {versions.map((v: RateVersion, idx: number) => {
        const isActive = idx === 0;
        return (
          <PanelCard key={v.id}>
            <Stack gap="xs">
              <Group gap="sm">
                <Title order={5}>{v.version}</Title>
                {isActive && (
                  <Badge color="green" variant="light" size="sm">
                    Active
                  </Badge>
                )}
              </Group>
              <Group gap="xl">
                <div>
                  <Text size="xs" c="dimmed">
                    Effective from
                  </Text>
                  <Text size="sm">
                    {new Date(v.effective_from).toLocaleDateString()}
                  </Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Unit cost
                  </Text>
                  <Text size="sm">
                    ${v.unit_cost_dollars.toFixed(6)} / unit
                  </Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Storage rate
                  </Text>
                  <Text size="sm">
                    {v.units_per_gb_per_month} units/GB/month
                  </Text>
                </div>
              </Group>
              <ActivityCostsTable versionId={v.id} />
            </Stack>
          </PanelCard>
        );
      })}
    </Stack>
  );
}

/**
 * Billing dashboard page at /billing.
 * - System admins can select any group to view its spending history.
 * - Group admins see the groups they administer.
 * - Both views include a monthly bar chart and a period selector (individual month or All Time).
 * - Rate versions tab shows all versions with their activity costs flat (no accordion).
 */
export function BillingPage(): JSX.Element {
  const { isSystemAdmin } = useAuth();

  return (
    <Stack gap="lg">
      <PageHeader
        title="Billing"
        description="View billing history and current pricing."
      />

      <PanelCard>
        <Tabs defaultValue="spending">
          <Tabs.List>
            <Tabs.Tab value="spending" data-testid="billing-spending-tab">
              Group Spending
            </Tabs.Tab>
            <Tabs.Tab value="cap" data-testid="billing-cap-tab">
              Spending Cap
            </Tabs.Tab>
            <Tabs.Tab value="rates" data-testid="billing-rates-tab">
              Rate Versions
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="spending" pt="md">
            <GroupSpendingView />
          </Tabs.Panel>

          <Tabs.Panel value="cap" pt="md">
            <SpendingCapView isSystemAdmin={isSystemAdmin} />
          </Tabs.Panel>

          <Tabs.Panel value="rates" pt="md">
            <RateVersionsView />
          </Tabs.Panel>
        </Tabs>
      </PanelCard>
    </Stack>
  );
}
