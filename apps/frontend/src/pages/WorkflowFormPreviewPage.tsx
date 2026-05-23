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
import { isUserFacingActivity } from "../features/workflow-builder/catalog-utils";
import type { JsonSchemaProperty } from "../features/workflow-builder/json-schema-form";
import { JsonSchemaForm } from "../features/workflow-builder/json-schema-form";

/**
 * Seed a parameters object with defaults derived from the schema's
 * `x-default` / `default` hints. Picks the first variant for
 * discriminated unions so the form starts with a valid shape.
 */
function seedDefaults(
  schema: JsonSchemaProperty | undefined,
): Record<string, unknown> {
  if (!schema) return {};
  const target =
    Array.isArray(schema.anyOf) && schema.anyOf.length > 0
      ? (schema.anyOf[0] as JsonSchemaProperty)
      : schema;
  if (target.type !== "object" || !target.properties) return {};
  const out: Record<string, unknown> = {};
  for (const [name, prop] of Object.entries(target.properties)) {
    if (prop.const !== undefined) {
      out[name] = prop.const;
      continue;
    }
    const def = prop["x-default"] ?? prop.default;
    if (def !== undefined) out[name] = def;
  }
  return out;
}

export function WorkflowFormPreviewPage() {
  const activityTypes = useMemo(
    () => listActivityTypes().filter(isUserFacingActivity).sort(),
    [],
  );
  const initialType = activityTypes[0] ?? "";
  const initialSchema = initialType
    ? (getActivityParametersJsonSchema(initialType) as JsonSchemaProperty)
    : undefined;
  const [selectedType, setSelectedType] = useState<string>(initialType);
  const [paramValues, setParamValues] = useState<Record<string, unknown>>(() =>
    seedDefaults(initialSchema),
  );

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
    // Distinguish "form is incomplete — required field not yet filled" from
    // "form has a wrong value the user typed in". The first is a normal
    // starting state; the second is the actually-broken case.
    const issues = result.error.issues;
    const isMissingIssue = (issue: (typeof issues)[number]) => {
      const input = (issue as { input?: unknown }).input;
      const received = (issue as { received?: string }).received;
      if (
        issue.code === "invalid_type" &&
        (input === undefined || received === "undefined")
      ) {
        return true;
      }
      // `z.array(...).min(1)` on an empty/undefined array
      if (
        issue.code === "too_small" &&
        (input === undefined || (Array.isArray(input) && input.length === 0))
      ) {
        return true;
      }
      // `z.union([...])` where the input was undefined — every branch
      // failed because nothing was provided.
      if (issue.code === "invalid_union" && input === undefined) {
        return true;
      }
      return false;
    };
    const incomplete = issues.every(isMissingIssue);
    return { ok: false as const, issues, incomplete };
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
            const nextSchema = getActivityParametersJsonSchema(v) as
              | JsonSchemaProperty
              | undefined;
            setParamValues(seedDefaults(nextSchema));
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
            ) : validation?.incomplete ? (
              <Alert
                color="yellow"
                variant="light"
                title={`${validation.issues.length} required field${
                  validation.issues.length === 1 ? "" : "s"
                } not yet filled`}
              >
                <Text size="xs" c="dimmed">
                  This activity's schema declares required parameters that the
                  dev preview can't pre-fill (typically the catalog's
                  rich-editor widgets — rule lists, mapping editors). Fill them
                  in to see validation turn green.
                </Text>
                <Code block style={{ fontSize: 11, marginTop: 6 }}>
                  {JSON.stringify(
                    validation.issues.map((i) => ({
                      path: i.path,
                      message: i.message,
                    })),
                    null,
                    2,
                  )}
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
