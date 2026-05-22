/**
 * Dev-only preview page for the schema-driven form renderer.
 *
 * Lets you pick an activity from the shared catalog and see:
 *   - the resulting Mantine form (rendered by JsonSchemaForm)
 *   - the JSON Schema emitted by `z.toJSONSchema()`
 *   - the current form value (so you can poke at it)
 *   - live Zod validation results
 *
 * This is a tracer for Phase 1A's settings-panel work — not the real
 * workflow editor. Route: /workflows/dev-form-preview
 */

import {
  ACTIVITY_CATALOG,
  getActivityParametersJsonSchema,
  listActivityTypes,
} from "@ai-di/graph-workflow";
import {
  Alert,
  Badge,
  Card,
  Code,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useMemo, useState } from "react";
import type { JsonSchemaProperty } from "../features/workflow-builder/json-schema-form";
import { JsonSchemaForm } from "../features/workflow-builder/json-schema-form";

export function WorkflowFormPreviewPage() {
  const activityTypes = useMemo(() => listActivityTypes().sort(), []);
  const [selectedType, setSelectedType] = useState<string>(
    activityTypes[0] ?? "",
  );
  const [paramValues, setParamValues] = useState<Record<string, unknown>>({});

  const entry = ACTIVITY_CATALOG[selectedType];
  const jsonSchema = useMemo(
    () =>
      selectedType
        ? (getActivityParametersJsonSchema(selectedType) as JsonSchemaProperty)
        : undefined,
    [selectedType],
  );

  const validation = useMemo(() => {
    if (!entry) return null;
    const result = entry.parametersSchema.safeParse(paramValues);
    if (result.success) {
      return { ok: true as const, parsed: result.data };
    }
    return { ok: false as const, issues: result.error.issues };
  }, [entry, paramValues]);

  return (
    <Stack gap="md" p="md">
      <Stack gap={4}>
        <Title order={2}>Workflow form renderer — dev preview</Title>
        <Text c="dimmed" size="sm">
          Tracer page for the Phase 1A schema-driven settings panel. Pick an
          activity to see how its Zod schema (single source of truth) renders as
          a Mantine form, what JSON Schema it emits, and how live validation
          behaves. Not a real workflow editor.
        </Text>
      </Stack>

      <Select
        label="Activity"
        description={`${activityTypes.length} activities currently in the catalog`}
        data={activityTypes.map((t) => ({
          value: t,
          label: `${ACTIVITY_CATALOG[t].displayName} — ${t}`,
        }))}
        value={selectedType}
        onChange={(v) => {
          if (v) {
            setSelectedType(v);
            setParamValues({});
          }
        }}
        maw={520}
      />

      {entry && (
        <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="md">
          <Card withBorder padding="md">
            <Stack gap="xs" mb="md">
              <Group gap="xs">
                <Title order={4} mb={0}>
                  {entry.displayName}
                </Title>
                <Badge size="sm" variant="light">
                  {entry.category}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed">
                {entry.description}
              </Text>
            </Stack>
            <Title order={5} mb="xs">
              Parameters form
            </Title>
            <JsonSchemaForm
              schema={jsonSchema}
              value={paramValues}
              onChange={setParamValues}
            />
            <Stack gap={4} mt="md">
              <Text size="xs" fw={500} c="dimmed">
                Input slots ({entry.inputs.length})
              </Text>
              {entry.inputs.map((input) => (
                <Text size="xs" c="dimmed" key={input.name}>
                  • {input.label}
                  {input.required ? " (required)" : ""} → reads ctx
                </Text>
              ))}
              <Text size="xs" fw={500} c="dimmed" mt="xs">
                Output slots ({entry.outputs.length})
              </Text>
              {entry.outputs.map((output) => (
                <Text size="xs" c="dimmed" key={output.name}>
                  • {output.label}
                  {output.required ? " (required)" : ""} → writes ctx
                </Text>
              ))}
            </Stack>
          </Card>

          <Card withBorder padding="md">
            <Title order={5} mb="xs">
              JSON Schema (emitted by z.toJSONSchema)
            </Title>
            <Code
              block
              style={{ fontSize: 11, maxHeight: 480, overflow: "auto" }}
            >
              {JSON.stringify(jsonSchema, null, 2)}
            </Code>
          </Card>

          <Card withBorder padding="md">
            <Title order={5} mb="xs">
              Live value + validation
            </Title>
            <Text size="xs" fw={500} c="dimmed">
              Form value
            </Text>
            <Code block style={{ fontSize: 11, marginBottom: 12 }}>
              {JSON.stringify(paramValues, null, 2)}
            </Code>
            {validation?.ok ? (
              <Alert color="green" variant="light" title="Validation passed">
                <Text size="xs">Parsed value:</Text>
                <Code block style={{ fontSize: 11 }}>
                  {JSON.stringify(validation.parsed, null, 2)}
                </Code>
              </Alert>
            ) : (
              <Alert color="red" variant="light" title="Validation failed">
                <Code block style={{ fontSize: 11 }}>
                  {JSON.stringify(validation?.issues, null, 2)}
                </Code>
              </Alert>
            )}
          </Card>
        </SimpleGrid>
      )}
    </Stack>
  );
}
