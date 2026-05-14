/**
 * UI Adapter Layer
 *
 * Provides a stable import surface for common UI components used by the
 * reference implementation. Product code imports from this module rather
 * than directly from Mantine or B.C. Design System packages.
 *
 * Each export is classified as one of:
 *   - BC DS native: Uses a B.C. Design System React component.
 *   - Mantine fallback: Uses Mantine because no suitable BC DS replacement
 *     exists or migration is deferred.
 *   - Application-specific: Custom product component using BC DS tokens
 *     and Mantine layout primitives.
 */

import {
  Select as BcdsSelect,
  TextField as BcdsTextField,
} from "@bcgov/design-system-react-components";
import {
  ActionIcon,
  Badge,
  type BadgeProps,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Paper,
  type PaperProps,
  SimpleGrid,
  Stack,
  Table,
  type TableProps,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import type { MouseEventHandler, ReactNode } from "react";

/* ── BC DS native adapters ─────────────────────────────────────────── */

type SelectOption = {
  value: string;
  label: string;
};

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
}

/**
 * Classification: BC DS native
 * Uses B.C. Design System `TextField` with a search icon.
 */
export function SearchField({
  value,
  onChange,
  placeholder = "Search title or filename",
  isDisabled,
}: SearchFieldProps) {
  return (
    <div style={{ flex: 1 }}>
      <BcdsTextField
        aria-label={placeholder}
        value={value}
        onChange={onChange}
        iconLeft={<IconSearch size={16} />}
        isDisabled={isDisabled}
      />
    </div>
  );
}

interface StatusSelectProps {
  data: SelectOption[];
  value: string;
  onChange: (value: string | null) => void;
  placeholder?: string;
  width?: number;
}

/**
 * Classification: BC DS native
 * Uses B.C. Design System `Select` with items mapped from the data prop.
 */
export function StatusSelect({
  data,
  value,
  onChange,
  placeholder = "Status",
  width = 180,
}: StatusSelectProps) {
  const items = data.map((item) => ({
    id: item.value,
    label: item.label,
  }));

  return (
    <div style={{ width }}>
      <BcdsSelect
        aria-label={placeholder}
        items={items}
        selectedKey={value}
        onSelectionChange={(key) => onChange(key as string)}
      />
    </div>
  );
}

/* ── Mantine fallback adapters ─────────────────────────────────────── */

interface StatusBadgeProps extends BadgeProps {
  children: ReactNode;
}

/**
 * Classification: Mantine fallback
 * Retained as Mantine Badge because BC DS Tag does not cover all required
 * status colors (e.g. "orange") used in the reference implementation.
 */
export function StatusBadge({ children, ...props }: StatusBadgeProps) {
  return (
    <Badge variant="light" {...props}>
      {children}
    </Badge>
  );
}

interface DataTableProps extends TableProps {
  children: ReactNode;
}

/**
 * Classification: Mantine fallback
 * No confirmed B.C. Design System table component exists.
 */
export function DataTable({ children, ...props }: DataTableProps) {
  return (
    <Table highlightOnHover verticalSpacing="sm" {...props}>
      {children}
    </Table>
  );
}

interface IconActionButtonProps {
  onClick?: MouseEventHandler<HTMLButtonElement>;
  variant?:
    | "subtle"
    | "filled"
    | "light"
    | "outline"
    | "default"
    | "transparent"
    | "white";
  color?: string;
  disabled?: boolean;
  loading?: boolean;
  tooltip: string;
  icon: ReactNode;
}

/**
 * Classification: Mantine fallback
 * Retained as Mantine ActionIcon + Tooltip because product code relies on
 * native MouseEvent.stopPropagation() in table row contexts, which is not
 * available through React Aria's PressEvent used by BC DS Button.
 */
export function IconActionButton({
  tooltip,
  icon,
  ...props
}: IconActionButtonProps) {
  return (
    <Tooltip label={tooltip}>
      <ActionIcon {...props}>{icon}</ActionIcon>
    </Tooltip>
  );
}

/* ── Application-specific components ───────────────────────────────── */

interface PanelCardProps extends PaperProps {
  children: ReactNode;
}

/**
 * Classification: Application-specific
 * Card container using Mantine Paper styled with BC DS tokens where practical.
 */
export function PanelCard({ children, ...props }: PanelCardProps) {
  return (
    <Paper shadow="sm" radius="md" p="lg" withBorder {...props}>
      {children}
    </Paper>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  valueColor?: string;
}

/**
 * Classification: Application-specific
 * Summary metric card using Mantine Paper and Text.
 */
export function StatCard({ label, value, valueColor }: StatCardProps) {
  return (
    <Paper radius="md" p="md" withBorder>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={600} size="lg" c={valueColor}>
        {value}
      </Text>
    </Paper>
  );
}

/* ── Mantine fallback re-exports ───────────────────────────────────── */

/**
 * Layout and utility re-exports: Mantine fallback.
 * These are Mantine primitives with no BC DS equivalent.
 * Product code imports them here so the migration path is centralized.
 */
export {
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
};
