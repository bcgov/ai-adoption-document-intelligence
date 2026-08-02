/**
 * CanvasLegend — UX walkthrough 2026-07-29.
 *
 * "I have been wondering what do these colours mean … I couldn't find what
 * do these colours mean." The scheme was always deliberate — port/wire
 * colours come from the artifact-kind registry, one colour per data FAMILY,
 * not per type — but nothing in the UI said so. This popover teaches it in
 * place.
 *
 * The family swatches are read from the live registry (via `colorForKind`
 * on each family's root kind), and the switch accent from
 * `control-flow-visual-hints`, so the legend can never drift from what the
 * canvas actually paints.
 */

import type { KindRef } from "@ai-di/graph-workflow";
import { Box, Button, Popover, Stack, Text } from "@mantine/core";
import { IconPalette } from "@tabler/icons-react";
import { useState } from "react";
import { getControlFlowVisualHints } from "../control-flow-visual-hints";
import { colorForKind } from "./artifact-kind-colour";

/** One colour per data family — root kind of each registry family. */
const FAMILY_ROWS: Array<{ kind: KindRef | undefined; label: string }> = [
  { kind: "Document", label: "Documents & files" },
  { kind: "Segment", label: "Segments" },
  { kind: "OcrResult", label: "OCR results" },
  { kind: "Classification", label: "Classification & validation" },
  { kind: "Reference", label: "References" },
  {
    kind: "Identifier",
    label: "Identifiers (document, group, model, request IDs)",
  },
  { kind: undefined, label: "Untyped (anything)" },
];

function Swatch({ color }: { color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: `var(--mantine-color-${color}-6, ${color})`,
        flexShrink: 0,
      }}
    />
  );
}

function WireSample({
  stroke,
  dashed,
  width = 2,
}: {
  stroke: string;
  dashed?: boolean;
  width?: number;
}) {
  return (
    <svg width={26} height={8} aria-hidden style={{ flexShrink: 0 }}>
      <line
        x1={1}
        y1={4}
        x2={25}
        y2={4}
        stroke={stroke}
        strokeWidth={width}
        strokeDasharray={dashed ? "6 4" : undefined}
      />
    </svg>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <Box style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {children}
    </Box>
  );
}

export function CanvasLegend() {
  const [opened, setOpened] = useState(false);
  const switchAccent = getControlFlowVisualHints("switch").color;

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="top-start"
      withinPortal
      shadow="md"
      width={280}
      transitionProps={{ duration: 0 }}
    >
      <Popover.Target>
        <Button
          variant="default"
          size="compact-xs"
          leftSection={<IconPalette size={13} />}
          onClick={() => setOpened((o) => !o)}
          data-testid="canvas-legend-button"
          aria-label="Colour legend"
        >
          Legend
        </Button>
      </Popover.Target>
      <Popover.Dropdown p="xs" data-testid="canvas-legend">
        <Stack gap={8}>
          <Text
            size="xs"
            fw={600}
            tt="uppercase"
            style={{ letterSpacing: 0.4 }}
          >
            Wires
          </Text>
          <Stack gap={4}>
            <Row>
              <WireSample
                stroke="var(--mantine-color-gray-5, #adb5bd)"
                dashed
              />
              <Text size="xs">Runs after — order only, no data</Text>
            </Row>
            <Row>
              <WireSample stroke="var(--mantine-color-blue-6, #228be6)" />
              <Text size="xs">Data flows — colour = data family</Text>
            </Row>
            <Row>
              <WireSample stroke="var(--mantine-color-red-6, #e03131)" />
              <Text size="xs">Error route (on failure)</Text>
            </Row>
            <Row>
              <WireSample stroke={switchAccent} />
              <Text size="xs">Branch of a condition (switch)</Text>
            </Row>
          </Stack>
          <Text
            size="xs"
            fw={600}
            tt="uppercase"
            style={{ letterSpacing: 0.4 }}
          >
            Port dots
          </Text>
          <Stack gap={4} data-testid="canvas-legend-families">
            {FAMILY_ROWS.map((row) => (
              <Row key={row.label}>
                <Swatch color={colorForKind(row.kind)} />
                <Text size="xs">{row.label}</Text>
              </Row>
            ))}
            <Row>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "var(--mantine-color-blue-6, #228be6)",
                  outline: "2px solid var(--mantine-color-blue-3, #a5d8ff)",
                  outlineOffset: 2,
                  flexShrink: 0,
                }}
              />
              <Text size="xs">Double ring — a list of items</Text>
            </Row>
            <Row>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "var(--mantine-color-gray-5, #adb5bd)",
                  boxShadow: "0 0 0 3px var(--mantine-color-yellow-5, #fab005)",
                  flexShrink: 0,
                }}
              />
              <Text size="xs">Amber ring — input still needs a source</Text>
            </Row>
          </Stack>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
