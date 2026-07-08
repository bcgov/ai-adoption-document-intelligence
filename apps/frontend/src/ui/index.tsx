/**
 * UI Adapter Layer
 *
 * Provides a stable import surface for common UI components. Product code
 * imports from this module rather than directly from Mantine or BC DS packages.
 *
 * Migration split (see docs-md/BC_DESIGN_SYSTEM_MIGRATION.md):
 *   - **Visual:** BC DS components + design tokens (government look and feel).
 *   - **Functional:** Mantine-style props preserved on adapters so feature
 *     code does not need wide API rewrites (e.g. Button `leftSection`, `loading`).
 *
 * Each export is classified as one of:
 *   - BC DS native: BC DS component under the hood; may expose Mantine-compat props.
 *   - Mantine fallback: Mantine implementation when BC DS is missing or deferred.
 *   - Application-specific: Product composites using BC DS tokens + layout primitives.
 */

import {
  Select as BcdsSelect,
  TextField as BcdsTextField,
} from "@bcgov/design-system-react-components";
import {
  Accordion,
  ActionIcon,
  Anchor,
  AppShell,
  Avatar,
  Box,
  Breadcrumbs,
  Card,
  Center,
  Code,
  Collapse,
  type ComboboxItem,
  Container,
  CopyButton,
  createTheme,
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
  MultiSelect,
  NavLink,
  Notification,
  Pagination,
  Paper,
  type PaperProps,
  Popover,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Tabs,
  TagsInput,
  UnstyledButton,
} from "@mantine/core";
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
import type { ReactNode } from "react";
import { Alert } from "./Alert";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { ConfirmActionModal } from "./ConfirmActionModal";
import { DataTable } from "./DataTable";
import { DateInput } from "./DateInput";
import { Divider } from "./Divider";
import { IconActionButton } from "./IconActionButton";
import { Modal } from "./Modal";
import { NumberInput } from "./NumberInput";
import { PageHeader } from "./PageHeader";
import { Progress } from "./Progress";
import { Radio } from "./Radio";
import { Select } from "./Select";
import { StatusBadge } from "./StatusBadge";
import { Switch } from "./Switch";
import { Text } from "./Text";
import { Textarea } from "./Textarea";
import { TextInput } from "./TextInput";
import { Title } from "./Title";
import { Tooltip } from "./Tooltip";

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
}: StatusSelectProps) {
  const items = data.map((item) => ({
    id: item.value,
    label: item.label,
  }));

  return (
    <div className="bcds-form-field bcds-form-field--fit">
      <BcdsSelect
        aria-label={placeholder}
        items={items}
        selectedKey={value}
        onSelectionChange={(key) => onChange(key as string)}
      />
    </div>
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
    <Paper
      className="bcds-panel-card"
      shadow="sm"
      radius="md"
      p="lg"
      withBorder
      {...props}
    >
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
    <Paper className="bcds-stat-card" radius="md" p="md" withBorder>
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

export type { AppAlertProps } from "./Alert";
export type { AppBadgeProps } from "./Badge";
export type { AppButtonProps } from "./Button";
export type { AppCheckboxProps } from "./Checkbox";
export type { ConfirmActionModalProps } from "./ConfirmActionModal";
export type { AppDataTableProps } from "./DataTable";
export type { AppDateInputProps } from "./DateInput";
export type { AppDividerProps } from "./Divider";
export type { IconActionButtonProps } from "./IconActionButton";
export type { AppModalProps } from "./Modal";
export type { AppNumberInputProps } from "./NumberInput";
export type { PageHeaderProps } from "./PageHeader";
export type { AppProgressProps } from "./Progress";
export type { AppRadioGroupProps, AppRadioProps } from "./Radio";
export type { AppSelectProps, SelectDataItem } from "./Select";
export type { AppStatusBadgeProps } from "./StatusBadge";
export type { AppSwitchProps } from "./Switch";
export { rem } from "./spacingUtils";
export type { AppTextProps } from "./Text";
export type { AppTextareaProps } from "./Textarea";
export type { AppTextInputProps } from "./TextInput";
export type { AppTitleProps } from "./Title";
export type { AppTooltipProps } from "./Tooltip";
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
  ConfirmActionModal,
  Container,
  CopyButton,
  createTheme,
  DataTable,
  DateInput,
  Divider,
  Drawer,
  Dropzone,
  FileInput,
  Flex,
  Grid,
  Group,
  IconActionButton,
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
  PageHeader,
  Pagination,
  Paper,
  Popover,
  Progress,
  Radio,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  StatusBadge,
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
