import type { ComboboxItem } from "@mantine/core";
import { Anchor, Select, Tooltip } from "@mantine/core";
import type { JSX } from "react";
import { useAuth } from "@/auth/AuthContext";
import { useAllGroups } from "@/data/hooks/useGroups";
import { useGroup } from "../../auth/GroupContext";

/**
 * A searchable dropdown that lets the authenticated user switch their active group.
 * Rendered in the app header adjacent to the user avatar.
 *
 * When the user has no group memberships, a non-interactive prompt linking
 * to the membership-request page is shown in place of the dropdown.
 *
 * @returns The group selector control or the empty-groups prompt.
 */
export function GroupSelector(): JSX.Element {
  const { availableGroups, activeGroup, setActiveGroup } = useGroup();
  const auth = useAuth(); // Ensure we re-render when auth state changes, to update available groups and handle logout cases
  const { data: allGroups } = useAllGroups();

  const groups = auth.isSystemAdmin ? (allGroups ?? []) : availableGroups;

  if (groups.length === 0) {
    return (
      <Anchor
        href="/request-membership"
        size="sm"
        c="dimmed"
        data-testid="no-groups-link"
      >
        No groups — request membership
      </Anchor>
    );
  }

  const data: ComboboxItem[] = groups.map((g) => ({
    value: g.id,
    label: g.name,
  }));

  /**
   * Handles selection changes from the Mantine Select combobox.
   * Resolves the full Group object and delegates to `setActiveGroup`.
   *
   * @param value - The id of the selected group, or null if cleared.
   */
  const handleChange = (value: string | null): void => {
    if (!value) return;
    const group = groups?.find((g) => g.id === value);
    if (group) setActiveGroup(group);
  };

  return (
    <Tooltip label="Active Group" position="bottom" withArrow>
      <Select
        data={data}
        value={activeGroup?.id ?? null}
        onChange={handleChange}
        searchable
        placeholder="Select a group"
        size="sm"
        w={180}
        aria-label="Active group"
        data-testid="group-selector"
      />
    </Tooltip>
  );
}
