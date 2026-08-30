/**
 * LibraryPortListEditor — row editor for a library workflow's
 * `metadata.inputs[]` / `metadata.outputs[]`.
 *
 * Each row is a `LibraryPortDescriptor` ({ label, path, type, kind? }).
 * Adapted from the group panel's `ExposedParamsEditor` (US-044) but
 * simplified: no `nodeId`, no `options`/`default`, and the type set matches
 * `CtxDeclaration`'s ("string" | "number" | "boolean" | "object" |
 * "array"). The optional `kind` column (US-099) annotates the port with
 * an `ArtifactKind` from the typed-I/O registry; it reuses the helpers
 * from `../settings/KindSelect` so library + ctx kind pickers stay in
 * sync. Used by the "Save as library" modal.
 */

import {
  ActionIcon,
  Box,
  Button,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import type { KindRef, LibraryPortDescriptor } from "../../../types/workflow";
import { KindSelect } from "../settings/KindSelect";

const PORT_TYPE_OPTIONS: Array<{
  value: LibraryPortDescriptor["type"];
  label: string;
}> = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "object", label: "Object" },
  { value: "array", label: "Array" },
];

function emptyRow(): LibraryPortDescriptor {
  return { label: "", path: "", type: "string" };
}

export interface LibraryPortListEditorProps {
  title: string;
  description: string;
  /** Stable testid prefix; rows get `${testIdBase}-row-${index}`. */
  testIdBase: string;
  rows: LibraryPortDescriptor[];
  onChange: (next: LibraryPortDescriptor[]) => void;
}

export function LibraryPortListEditor({
  title,
  description,
  testIdBase,
  rows,
  onChange,
}: LibraryPortListEditorProps) {
  const addRow = () => onChange([...rows, emptyRow()]);
  const removeRowAt = (index: number) =>
    onChange(rows.filter((_, i) => i !== index));
  const setRowAt = (index: number, next: LibraryPortDescriptor) =>
    onChange(rows.map((row, i) => (i === index ? next : row)));

  return (
    <Box data-testid={testIdBase}>
      <Group justify="space-between" align="center" mb={4}>
        <Title order={5} style={{ margin: 0 }}>
          {title}
        </Title>
        <Button
          size="compact-xs"
          variant="light"
          leftSection={<IconPlus size={12} />}
          onClick={addRow}
          data-testid={`${testIdBase}-add`}
        >
          Add row
        </Button>
      </Group>
      <Text size="10px" c="dimmed" mb="xs">
        {description}
      </Text>

      {rows.length === 0 ? (
        <Text size="xs" c="dimmed">
          No entries yet. Click "Add row" to declare a port.
        </Text>
      ) : (
        <Stack gap="xs">
          {rows.map((row, index) => (
            <Box
              // Index-based key is intentional: rows have no stable id.
              key={`${testIdBase}-row-${index}`}
              data-testid={`${testIdBase}-row-${index}`}
              style={{
                border:
                  "1px solid var(--mantine-color-default-border, #2c2e33)",
                borderRadius: 4,
                padding: 8,
              }}
            >
              <Group justify="space-between" align="center" mb="xs">
                <Text size="xs" fw={600}>
                  Row {index + 1}
                </Text>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="red"
                  onClick={() => removeRowAt(index)}
                  aria-label={`Remove row ${index + 1}`}
                  data-testid={`${testIdBase}-row-${index}-remove`}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
              <Stack gap="xs">
                <TextInput
                  label="Label"
                  placeholder="e.g. Document URL"
                  size="xs"
                  value={row.label}
                  onChange={(event) =>
                    setRowAt(index, {
                      ...row,
                      label: event.currentTarget.value,
                    })
                  }
                  data-testid={`${testIdBase}-row-${index}-label`}
                />
                <TextInput
                  label="Path"
                  placeholder="e.g. ctx.documentUrl"
                  size="xs"
                  value={row.path}
                  onChange={(event) =>
                    setRowAt(index, { ...row, path: event.currentTarget.value })
                  }
                  data-testid={`${testIdBase}-row-${index}-path`}
                />
                <Select
                  label="Type"
                  size="xs"
                  data={PORT_TYPE_OPTIONS}
                  value={row.type}
                  onChange={(next) => {
                    if (!next) return;
                    setRowAt(index, {
                      ...row,
                      type: next as LibraryPortDescriptor["type"],
                    });
                  }}
                  allowDeselect={false}
                  data-testid={`${testIdBase}-row-${index}-type`}
                />
                <KindSelect
                  label="Kind"
                  size="xs"
                  placeholder="—"
                  value={row.kind}
                  onChange={(next: KindRef | undefined) => {
                    // Strip the `kind` property entirely when the wildcard is
                    // picked — `kind?` is optional, not nullable. Mirrors the
                    // ctx-row pattern in WorkflowSettingsDrawer (US-098).
                    if (next === undefined) {
                      const { kind: _omitted, ...rest } = row;
                      setRowAt(index, rest);
                    } else {
                      setRowAt(index, { ...row, kind: next });
                    }
                  }}
                  aria-label={`Kind for ${row.label || row.path || `row ${index + 1}`}`}
                  data-testid={`${testIdBase}-row-${index}-kind`}
                />
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
