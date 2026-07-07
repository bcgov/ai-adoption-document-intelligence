import { notifications } from "@mantine/notifications";
import {
  IconCurrencyDollar,
  IconLock,
  IconLockOpen,
} from "@tabler/icons-react";
import { type JSX, useState } from "react";
import {
  useGroupBillingConfig,
  useSetBillingCap,
} from "../../data/hooks/useBillingConfig";
import {
  Badge,
  Button,
  Group,
  Loader,
  NumberInput,
  Stack,
  Text,
} from "../../ui";

interface BillingTabProps {
  groupId: string;
  readOnly?: boolean;
}

/**
 * Tab panel showing the monthly spending cap configuration for a group.
 * Only visible to system admins.
 */
export function BillingTab({
  groupId,
  readOnly = false,
}: BillingTabProps): JSX.Element {
  const { data: config, isLoading } = useGroupBillingConfig(groupId);
  const setBillingCap = useSetBillingCap(groupId);

  const [editing, setEditing] = useState(false);
  const [capValue, setCapValue] = useState<number | "">("");

  const currentCap = config?.monthly_cap_dollars ?? null;

  const handleStartEdit = () => {
    setCapValue(currentCap ?? "");
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
  };

  const handleSave = () => {
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
          setEditing(false);
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
          setEditing(false);
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

  if (isLoading) {
    return (
      <Group py="md">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          Loading billing configuration…
        </Text>
      </Group>
    );
  }

  return (
    <Stack gap="md">
      <div>
        <Text fw={500} size="lg" style={{ fontWeight: "bold" }}>
          Monthly Spending Cap
        </Text>
        <Text size="xs" c="dimmed" mt={2}>
          Limits the total dollars this group can spend in a calendar month.
          Groups without a cap can spend without restriction.
        </Text>
      </div>

      {!editing ? (
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
          {!readOnly && (
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
            label="Monthly cap (USD)"
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
              onClick={handleSave}
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
              onClick={handleCancel}
              data-testid="billing-cancel-cap-btn"
            >
              Cancel
            </Button>
          </Group>
        </Stack>
      )}

      {config?.cap_configured_by && (
        <Text size="xs" c="dimmed">
          Last configured by {config.cap_configured_by}
          {config.cap_configured_at
            ? ` on ${new Date(config.cap_configured_at).toLocaleDateString()}`
            : ""}
        </Text>
      )}
    </Stack>
  );
}
