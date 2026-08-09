/**
 * CanvasLegend — UX walkthrough 2026-07-29, rebuilt for item 20 (2026-08-09).
 *
 * "I have been wondering what do these colours mean … I couldn't find what
 * do these colours mean." The scheme was always deliberate — port/wire
 * colours come from the artifact-kind registry, one colour per data FAMILY,
 * not per type — but nothing in the UI said so. This popover teaches it in
 * place.
 *
 * Then, 2026-08-06: *"there are like 12 to 13 of them."* He was counting THIS
 * popover, which really did render 13 rows. Item 20 cut the seven port
 * families to five and gave each one a shape, so the family list is now five
 * rows and each row shows both signals — the colour and the silhouette.
 *
 * It is FOUR named groups now (wires, port dots, rings, card borders) rather
 * than one undifferentiated list, and it gained a group: card borders, which
 * were never explained anywhere because there were thirteen of them. The row
 * count went up, not down — but the thing being taught went from ~24 decodable
 * distinctions to 14, and the rows are now grouped by what you are looking at
 * rather than run together. Counting rows was the symptom; the vocabulary was
 * the disease.
 *
 * Everything here is READ from what the canvas paints rather than restated:
 * the families from `PORT_FAMILIES`, the sequence and error strokes from
 * `WorkflowEdge`, the switch accent from `control-flow-visual-hints`. Three of
 * the drifts item 20 found were in exactly the four wire rows below, where a
 * sample had been hand-written against stock Mantine and the app theme
 * overrode the scale underneath it:
 *
 *   - "Runs after" sampled `gray-5` → the theme's `#C6C5C3`, while the real
 *     sequence wire is `#9CA3AF`.
 *   - "Error route" sampled `red-6` → the theme's dark `#822623`, while the
 *     error handle dot was `#e03131`.
 *   - "Data flows" sampled `blue-6`, which is ALSO the Documents family
 *     colour — so the row meaning "any data" was painted in the colour that
 *     means "a document". It is now drawn as a run of every family colour,
 *     which is what "colour = data family" actually looks like.
 */

import { Box, Button, Popover, Stack, Text } from "@mantine/core";
import { IconPalette } from "@tabler/icons-react";
import { useState } from "react";
import { getControlFlowVisualHints } from "../control-flow-visual-hints";
import { NODE_ACCENTS } from "../node-accents";
import {
  PORT_FAMILIES,
  type PortShape,
  portDotColor,
  portRingColor,
} from "./artifact-kind-colour";
import { portShapeStyle } from "./handle-style";
import { NEEDS_SOURCE_RING } from "./PortRows";
import { ERROR_STROKE, SEQUENCE_DASH, SEQUENCE_STROKE } from "./WorkflowEdge";

/** Swatch size, in px — a touch under the canvas's 12px dot so the rows sit tight. */
const SWATCH_SIZE = 11;

/**
 * One family's dot, drawn exactly as the canvas draws it: same colour, same
 * silhouette, same helper. A swatch that redraws the shape itself is a swatch
 * that will eventually disagree with the canvas.
 */
function Swatch({ color, shape }: { color: string; shape: PortShape }) {
  return (
    <span
      data-legend-swatch={color}
      data-legend-shape={shape}
      style={{
        display: "inline-block",
        flexShrink: 0,
        background: PORT_FAMILIES.find((f) => f.token === color)?.dot,
        ...portShapeStyle(shape, { color, size: SWATCH_SIZE }),
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
        strokeDasharray={dashed ? SEQUENCE_DASH : undefined}
      />
    </svg>
  );
}

/**
 * The "data flows" sample, drawn as one segment per family.
 *
 * The row it labels says "colour = data family", and it used to be painted in
 * a single blue — which was ALSO the Documents family colour, so the sample
 * for "any data" looked exactly like the sample for "a document". Showing all
 * five colours in one stroke says the sentence instead of contradicting it.
 */
function FamilyWireSample() {
  const segment = 24 / PORT_FAMILIES.length;
  return (
    <svg
      width={26}
      height={8}
      aria-hidden
      style={{ flexShrink: 0 }}
      data-testid="canvas-legend-data-wire-sample"
    >
      {PORT_FAMILIES.map((family, index) => (
        <line
          key={family.token}
          x1={1 + index * segment}
          y1={4}
          x2={1 + (index + 1) * segment}
          y2={4}
          stroke={family.dot}
          strokeWidth={2}
        />
      ))}
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
              <WireSample stroke={SEQUENCE_STROKE} dashed />
              <Text size="xs">Runs after — order only, no data</Text>
            </Row>
            <Row>
              <FamilyWireSample />
              <Text size="xs">Data flows — colour = data family</Text>
            </Row>
            <Row>
              <WireSample stroke={ERROR_STROKE} />
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
            {PORT_FAMILIES.map((family) => (
              <Row key={family.token}>
                <Swatch color={family.token} shape={family.shape} />
                <Text size="xs">
                  {family.label}
                  <Text span size="xs" c="dimmed">
                    {` — ${family.shapeLabel}`}
                  </Text>
                </Text>
              </Row>
            ))}
          </Stack>
          {/*
            The two ring modifiers stay, in their own group. Item 20's plan
            said the legend would land at 9 rows with these "folded into the
            family rows" — but there is nowhere to fold them: a family row
            shows one dot, and these are things that happen TO a dot, on top of
            whatever family it belongs to. Deleting them would take the only
            explanation of the amber ring out of the product. 13 rows → 11.
          */}
          <Text
            size="xs"
            fw={600}
            tt="uppercase"
            style={{ letterSpacing: 0.4 }}
          >
            Rings
          </Text>
          <Stack gap={4} data-testid="canvas-legend-rings">
            {/*
              Both samples are drawn on the Documents circle for concreteness,
              but either ring can appear on any family — they are modifiers,
              not families. The ring values come from the same constants the
              canvas uses so these two cannot drift either.
            */}
            <Row>
              <span
                style={{
                  display: "inline-block",
                  flexShrink: 0,
                  background: portDotColor("blue"),
                  ...portShapeStyle("circle", {
                    color: "blue",
                    size: SWATCH_SIZE,
                  }),
                  outline: `2px solid ${portRingColor("blue")}`,
                  outlineOffset: 2,
                }}
              />
              <Text size="xs">Double ring — a list of items</Text>
            </Row>
            <Row>
              <span
                style={{
                  display: "inline-block",
                  flexShrink: 0,
                  background: portDotColor("blue"),
                  ...portShapeStyle("circle", {
                    color: "blue",
                    size: SWATCH_SIZE,
                  }),
                  boxShadow: NEEDS_SOURCE_RING,
                }}
              />
              <Text size="xs">Amber ring — input still needs a source</Text>
            </Row>
          </Stack>
          {/*
            Card borders were never explained here, and until item 20 they
            could not be: there were thirteen of them, one per activity
            category plus one per control-flow type. There are five now, and
            five is a thing a popover can teach.
          */}
          <Text
            size="xs"
            fw={600}
            tt="uppercase"
            style={{ letterSpacing: 0.4 }}
          >
            Card borders
          </Text>
          <Stack gap={4} data-testid="canvas-legend-accents">
            {NODE_ACCENTS.map((accent) => (
              <Row key={accent.role}>
                <span
                  data-legend-accent={accent.role}
                  style={{
                    display: "inline-block",
                    flexShrink: 0,
                    width: 4,
                    height: SWATCH_SIZE,
                    borderRadius: 1,
                    background: accent.color,
                  }}
                />
                <Text size="xs">{accent.label}</Text>
              </Row>
            ))}
          </Stack>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
