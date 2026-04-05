import {
  Button,
  Divider,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { FC, useEffect, useMemo, useState } from "react";
import { FieldDefinition, FieldType } from "../../core/types/field";

interface FieldSchemaEditorProps {
  opened: boolean;
  onClose: () => void;
  onSubmit: (data: {
    field_key: string;
    field_type: FieldType;
    field_format?: string;
    display_order?: number;
  }) => void;
  initialValue?: FieldDefinition | null;
}

interface FormatSpec {
  canonicalize?: string;
  pattern?: string;
  displayTemplate?: string;
}

const CANONICALIZE_PRESETS = [
  { value: "", label: "None (no format spec)" },
  { value: "digits", label: "Digits only" },
  { value: "date:YYYY-MM-DD", label: "Date (ISO)" },
  { value: "text", label: "Text (clean whitespace)" },
  { value: "number", label: "Number" },
  { value: "noop", label: "No operation" },
  { value: "__custom__", label: "Custom..." },
];

const PRESET_VALUES = new Set(
  CANONICALIZE_PRESETS.map((p) => p.value).filter((v) => v !== "__custom__"),
);

function parseFormatSpec(fieldFormat: string | undefined): {
  canonicalizePreset: string;
  customCanonicalize: string;
  formatPattern: string;
  displayTemplate: string;
} {
  if (!fieldFormat) {
    return {
      canonicalizePreset: "",
      customCanonicalize: "",
      formatPattern: "",
      displayTemplate: "",
    };
  }

  let spec: FormatSpec;
  try {
    spec = JSON.parse(fieldFormat) as FormatSpec;
  } catch {
    return {
      canonicalizePreset: "",
      customCanonicalize: "",
      formatPattern: "",
      displayTemplate: "",
    };
  }

  const canonicalize = spec.canonicalize ?? "";
  const isPreset = PRESET_VALUES.has(canonicalize);

  return {
    canonicalizePreset: isPreset ? canonicalize : "__custom__",
    customCanonicalize: isPreset ? "" : canonicalize,
    formatPattern: spec.pattern ?? "",
    displayTemplate: spec.displayTemplate ?? "",
  };
}

export const FieldSchemaEditor: FC<FieldSchemaEditorProps> = ({
  opened,
  onClose,
  onSubmit,
  initialValue,
}) => {
  const [fieldKey, setFieldKey] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>(FieldType.STRING);
  const [canonicalizePreset, setCanonicalizePreset] = useState("");
  const [customCanonicalize, setCustomCanonicalize] = useState("");
  const [formatPattern, setFormatPattern] = useState("");
  const [displayTemplate, setDisplayTemplate] = useState("");

  useEffect(() => {
    if (opened) {
      setFieldKey(initialValue?.fieldKey || "");
      setFieldType(initialValue?.fieldType || FieldType.STRING);

      const parsed = parseFormatSpec(initialValue?.fieldFormat);
      setCanonicalizePreset(parsed.canonicalizePreset);
      setCustomCanonicalize(parsed.customCanonicalize);
      setFormatPattern(parsed.formatPattern);
      setDisplayTemplate(parsed.displayTemplate);
    }
  }, [initialValue, opened]);

  const fieldTypeOptions = useMemo(
    () =>
      Object.values(FieldType).map((value) => ({
        value,
        label: value,
      })),
    [],
  );

  const handleSubmit = () => {
    const canonicalize =
      canonicalizePreset === "__custom__"
        ? customCanonicalize.trim()
        : canonicalizePreset;

    let fieldFormat: string | undefined;
    if (canonicalize) {
      const spec: FormatSpec = { canonicalize };
      if (formatPattern.trim()) {
        spec.pattern = formatPattern.trim();
      }
      if (displayTemplate.trim()) {
        spec.displayTemplate = displayTemplate.trim();
      }
      fieldFormat = JSON.stringify(spec);
    }

    onSubmit({
      field_key: fieldKey.trim(),
      field_type: fieldType,
      field_format: fieldFormat,
    });
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Field definition">
      <Stack gap="md">
        <TextInput
          label="Field key"
          placeholder="invoice_number"
          value={fieldKey}
          onChange={(event) => setFieldKey(event.currentTarget.value)}
          required
          disabled={Boolean(initialValue)}
        />
        <Select
          label="Field type"
          data={fieldTypeOptions}
          value={fieldType}
          onChange={(value) => setFieldType(value as FieldType)}
        />
        <Divider />
        <Text size="sm" fw={500}>
          Format spec
        </Text>
        <Select
          label="Canonicalize"
          data={CANONICALIZE_PRESETS}
          value={canonicalizePreset}
          onChange={(value) => setCanonicalizePreset(value ?? "")}
        />
        {canonicalizePreset === "__custom__" && (
          <TextInput
            label="Custom canonicalize"
            placeholder="uppercase|strip-spaces"
            value={customCanonicalize}
            onChange={(event) =>
              setCustomCanonicalize(event.currentTarget.value)
            }
          />
        )}
        <TextInput
          label="Pattern"
          placeholder="Optional regex pattern"
          value={formatPattern}
          onChange={(event) => setFormatPattern(event.currentTarget.value)}
        />
        <TextInput
          label="Display template"
          placeholder="(###) ###-###"
          value={displayTemplate}
          onChange={(event) => setDisplayTemplate(event.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!fieldKey.trim()}>
            Save field
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
