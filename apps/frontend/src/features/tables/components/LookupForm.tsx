import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { LOOKUP_TEMPLATES, templateFor } from "../lookup-templates";
import type { ColumnDef, LookupDef } from "../types";

interface Props {
  opened: boolean;
  onClose: () => void;
  columns: ColumnDef[];
  initial?: LookupDef;
  onSubmit: (lookup: LookupDef) => Promise<void>;
}

export function LookupForm({
  opened,
  onClose,
  columns,
  initial,
  onSubmit,
}: Props) {
  const initialTemplate = initial ? templateFor(initial) : LOOKUP_TEMPLATES[0];
  const [templateId, setTemplateId] = useState<string>(initialTemplate.id);
  const [name, setName] = useState<string>(initial?.name ?? "");
  const [values, setValues] = useState<Record<string, unknown>>(
    initial ? (initialTemplate.fromLookupDef(initial) ?? {}) : {},
  );
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset state when reopened with different initial
  useEffect(() => {
    if (opened) {
      const t = initial ? templateFor(initial) : LOOKUP_TEMPLATES[0];
      setTemplateId(t.id);
      setName(initial?.name ?? "");
      setValues(initial ? (t.fromLookupDef(initial) ?? {}) : {});
      setError(null);
      setNameError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, initial?.name]);

  const template =
    LOOKUP_TEMPLATES.find((t) => t.id === templateId) ?? LOOKUP_TEMPLATES[0];

  const handleSave = async () => {
    setError(null);
    setNameError(null);
    if (!name.trim()) {
      setNameError("Required");
      return;
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      setNameError(
        "Letters, digits, underscore. Must start with a letter or underscore.",
      );
      return;
    }
    setSaving(true);
    try {
      const lookup = template.toLookupDef(name, values, columns);
      await onSubmit(lookup);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={initial ? "Edit Lookup" : "Add Lookup"}
      size="lg"
    >
      <Stack>
        <TextInput
          label="Lookup name"
          description="Stable identifier used to invoke this lookup in workflows (e.g. byDate, find_by_id)"
          required
          disabled={!!initial}
          value={name}
          error={nameError}
          onChange={(e) => {
            setName(e.currentTarget.value);
            setNameError(null);
          }}
        />
        <Select
          label="Template"
          description="Pre-built shapes; use Custom for anything else"
          required
          data={LOOKUP_TEMPLATES.map((t) => ({ value: t.id, label: t.label }))}
          value={templateId}
          onChange={(v) => {
            setTemplateId(v ?? LOOKUP_TEMPLATES[0].id);
            setValues({});
          }}
          allowDeselect={false}
        />
        {template.renderFields({
          columns,
          values,
          setValue: (k, v) => setValues((s) => ({ ...s, [k]: v })),
        })}
        {error && (
          <Text c="red" size="sm">
            {error}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={handleSave}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
