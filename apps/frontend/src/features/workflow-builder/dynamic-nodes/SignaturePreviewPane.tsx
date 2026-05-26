/**
 * `SignaturePreviewPane` — derived signature card (Phase 6 US-178 /
 * REQUIREMENTS L37 §2).
 *
 * Pure-presentation card driven by `DynamicNodeSignature`. Renders:
 *  - header: slug + description + DYN pill + deterministic flag
 *  - inputs table (with Phase 3 kind colour dots + required badge)
 *  - outputs table (same shape, no required column — outputs are always
 *    "produced if reached")
 *  - parameters block: `<JsonSchemaForm schema readOnly />` so the
 *    preview matches the canvas settings panel exactly
 *  - allowNet chips (hidden when empty)
 *
 * All data flows from the editor's live-parse result — no fetching, no
 * mutations.
 */

import type {
  DynamicNodePort,
  DynamicNodeSignature,
} from "@ai-di/graph-workflow";
import { Badge, Box, Group, Stack, Text, Title } from "@mantine/core";
import { JsonSchemaForm } from "../json-schema-form";
import type { JsonSchemaProperty } from "./signature-preview-helpers";
import {
  isParamsSchemaEmpty,
  KIND_COLOR_TOKENS,
  resolveKindColor,
} from "./signature-preview-helpers";

export interface SignaturePreviewPaneProps {
  signature: DynamicNodeSignature | null;
}

export function SignaturePreviewPane({ signature }: SignaturePreviewPaneProps) {
  if (signature === null) {
    return (
      <Box
        data-testid="signature-preview-placeholder"
        p="md"
        style={{
          border: "1px dashed var(--mantine-color-default-border)",
          borderRadius: 6,
          background: "var(--mantine-color-gray-light-hover)",
        }}
      >
        <Text size="sm" c="dimmed">
          No signature yet — write a <code>@workflow-node</code> JSDoc header.
        </Text>
      </Box>
    );
  }

  const paramsHidden = isParamsSchemaEmpty(signature.paramsSchema);

  return (
    <Stack
      gap="md"
      data-testid="signature-preview-card"
      p="md"
      style={{
        border: "1px solid var(--mantine-color-default-border)",
        borderRadius: 6,
      }}
    >
      <Stack gap={4}>
        <Group gap="xs" align="center" wrap="wrap">
          <Title order={5} mb={0}>
            {signature.name}
          </Title>
          <Badge
            size="xs"
            variant="filled"
            color="grape"
            data-testid="signature-preview-dyn-pill"
          >
            DYN
          </Badge>
          {signature.deterministic ? (
            <Badge
              size="xs"
              color="green"
              variant="light"
              data-testid="signature-preview-deterministic-badge"
            >
              Deterministic (cached)
            </Badge>
          ) : (
            <Badge
              size="xs"
              color="gray"
              variant="light"
              data-testid="signature-preview-non-deterministic-badge"
            >
              Non-deterministic (not cached)
            </Badge>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          {signature.description}
        </Text>
      </Stack>

      <PortsList
        title="Inputs"
        ports={signature.inputs}
        showRequired
        testId="signature-preview-inputs"
      />

      <PortsList
        title="Outputs"
        ports={signature.outputs}
        showRequired={false}
        testId="signature-preview-outputs"
      />

      {!paramsHidden && (
        <Stack gap={6} data-testid="signature-preview-params">
          <Text size="sm" fw={500}>
            Parameters
          </Text>
          <JsonSchemaForm
            schema={signature.paramsSchema as JsonSchemaProperty}
            readOnly
          />
        </Stack>
      )}

      {signature.allowNet.length > 0 && (
        <Stack gap={6} data-testid="signature-preview-allow-net">
          <Text size="sm" fw={500}>
            Network access
          </Text>
          <Group gap={4} wrap="wrap">
            {signature.allowNet.map((host) => (
              <Badge
                key={host}
                size="sm"
                variant="light"
                color="blue"
                data-testid={`signature-preview-allow-net-${host}`}
              >
                {host}
              </Badge>
            ))}
          </Group>
        </Stack>
      )}
    </Stack>
  );
}

interface PortsListProps {
  title: string;
  ports: DynamicNodePort[];
  showRequired: boolean;
  testId: string;
}

function PortsList({ title, ports, showRequired, testId }: PortsListProps) {
  return (
    <Stack gap={4} data-testid={testId}>
      <Text size="sm" fw={500}>
        {title} ({ports.length})
      </Text>
      {ports.length === 0 ? (
        <Text size="xs" c="dimmed" fs="italic">
          (none declared)
        </Text>
      ) : (
        <Stack gap={2}>
          {ports.map((port) => {
            const color = resolveKindColor(port.kind);
            return (
              <Group
                key={port.name}
                gap={6}
                wrap="nowrap"
                data-testid={`${testId}-row-${port.name}`}
              >
                <Box
                  data-testid={`${testId}-dot-${port.name}`}
                  data-kind-color={color}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 8,
                    background: color,
                    flexShrink: 0,
                  }}
                />
                <Text size="xs">
                  <strong>{port.name}</strong> : {port.kind}
                </Text>
                {showRequired && port.required ? (
                  <Badge
                    size="xs"
                    color="red"
                    variant="light"
                    data-testid={`${testId}-required-${port.name}`}
                  >
                    required
                  </Badge>
                ) : null}
              </Group>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}

// Re-export the color tokens at file scope so tests can assert against
// the palette without poking into the helper module.
export { KIND_COLOR_TOKENS };
