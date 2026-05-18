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
  Accordion,
  ActionIcon,
  Alert,
  Anchor,
  AppShell,
  Avatar,
  Badge,
  type BadgeProps,
  Box,
  Breadcrumbs,
  Button,
  Card,
  Center,
  Checkbox,
  Code,
  Collapse,
  type ComboboxItem,
  Container,
  CopyButton,
  createTheme,
  Divider,
  Drawer,
  FileInput,
  Flex,
  Grid,
  Group,
  Image,
  JsonInput,
  Kbd,
  List,
  Loader,
  MantineProvider,
  Menu,
  Modal,
  MultiSelect,
  NavLink,
  Notification,
  NumberInput,
  Pagination,
  Paper,
  type PaperProps,
  Popover,
  Progress,
  Radio,
  rem,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Table,
  type TableProps,
  Tabs,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { Dropzone, type FileRejection } from "@mantine/dropzone";
import { useForm } from "@mantine/form";
import {
  useDebouncedValue,
  useDisclosure,
  useElementSize,
  useSessionStorage,
} from "@mantine/hooks";
import { Notifications, notifications } from "@mantine/notifications";
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

export type { ComboboxItem, FileRejection };
/**
 * Layout and utility re-exports: Mantine fallback.
 * These are Mantine primitives with no BC DS equivalent.
 * Product code imports them here so the migration path is centralized.
 */
export {
  Accordion,
  ActionIcon,
  Alert,
  Anchor,
  AppShell,
  Avatar,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Card,
  Center,
  Checkbox,
  Code,
  Collapse,
  Container,
  CopyButton,
  createTheme,
  DateInput,
  Divider,
  Drawer,
  Dropzone,
  FileInput,
  Flex,
  Grid,
  Group,
  Image,
  JsonInput,
  Kbd,
  List,
  Loader,
  MantineProvider,
  Menu,
  Modal,
  MultiSelect,
  NavLink,
  Notification,
  Notifications,
  NumberInput,
  notifications,
  Pagination,
  Paper,
  Popover,
  Progress,
  Radio,
  rem,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Table,
  Tabs,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
  useDebouncedValue,
  useDisclosure,
  useElementSize,
  useForm,
  useSessionStorage,
};
