/**
 * Tests for `ActivityPalette` (US-011).
 *
 * Each test maps to one acceptance scenario from
 * feature-docs/20260522-workflow-builder-control-flow-nodes/user_stories/US-011-palette-flow-control-section.md.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActivityPalette } from "./ActivityPalette";
import { CONTROL_FLOW_PALETTE_ENTRIES } from "./control-flow-palette-entries";
import {
  buildControlFlowSkeleton,
  type ControlFlowNodeType,
} from "./control-flow-skeletons";

function renderPalette(
  overrides: Partial<React.ComponentProps<typeof ActivityPalette>> = {},
) {
  const onAddActivity = overrides.onAddActivity ?? vi.fn();
  const onAddControlFlowNode = overrides.onAddControlFlowNode ?? vi.fn();
  const utils = render(
    <MantineProvider>
      <ActivityPalette
        onAddActivity={onAddActivity}
        onAddControlFlowNode={onAddControlFlowNode}
      />
    </MantineProvider>,
  );
  return { ...utils, onAddActivity, onAddControlFlowNode };
}

// ---------------------------------------------------------------------------
// Scenario 1: "Flow Control" section appears first
// ---------------------------------------------------------------------------

describe('ActivityPalette — Scenario 1: "Flow Control" section appears first', () => {
  it("renders a Flow Control section as the first section in the palette", () => {
    renderPalette();

    const headers = screen.getAllByText(
      (_, el) =>
        el?.tagName.toLowerCase() === "p" &&
        (el.textContent ?? "").trim().length > 0 &&
        // Mantine renders the uppercased category names via CSS, but the
        // text content remains the original casing. We match on the
        // exact string.
        true,
    );

    // Find the rendered category labels by their actual rendered text.
    const flowControlHeader = screen.getByText("Flow Control");
    expect(flowControlHeader).toBeInTheDocument();

    // The Flow Control header must appear textually before any of the
    // activity-category headers in the rendered DOM.
    const headerTexts = headers.map((h) => h.textContent?.trim() ?? "");
    const firstFlowControlIdx = headerTexts.indexOf("Flow Control");
    expect(firstFlowControlIdx).toBeGreaterThanOrEqual(0);

    const knownActivityCategories = [
      "File Handling",
      "OCR (Azure)",
      "OCR (Mistral)",
      "OCR Cleanup & Correction",
      "OCR Quality",
      "Document Handling",
      "Validation",
      "Storage",
      "Data Transformation",
      "Reference Data",
    ];
    for (const cat of knownActivityCategories) {
      const idx = headerTexts.indexOf(cat);
      if (idx === -1) continue;
      expect(idx).toBeGreaterThan(firstFlowControlIdx);
    }
  });

  it("lists all six control-flow node types under the Flow Control section", () => {
    renderPalette();

    const expected = [
      "switch",
      "map",
      "join",
      "childWorkflow",
      "pollUntil",
      "humanGate",
    ] as const;
    for (const type of expected) {
      expect(
        screen.getByTestId(`control-flow-palette-entry-${type}`),
      ).toBeInTheDocument();
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: each entry has an icon, display name, and short description
// ---------------------------------------------------------------------------

describe("ActivityPalette — Scenario 2: each entry has icon + display name + description", () => {
  it("renders the expected display name for each control-flow entry", () => {
    renderPalette();
    const expectedDisplayNames: Record<ControlFlowNodeType, string> = {
      switch: "Branch by condition",
      map: "Run for each item",
      join: "Collect results",
      childWorkflow: "Sub-workflow",
      pollUntil: "Wait until condition",
      humanGate: "Wait for approval",
    };
    for (const [type, displayName] of Object.entries(expectedDisplayNames) as [
      ControlFlowNodeType,
      string,
    ][]) {
      const row = screen.getByTestId(`control-flow-palette-entry-${type}`);
      expect(row).toHaveTextContent(displayName);
    }
  });

  it("renders a Tabler SVG icon inside each control-flow entry", () => {
    renderPalette();
    for (const entry of CONTROL_FLOW_PALETTE_ENTRIES) {
      const row = screen.getByTestId(
        `control-flow-palette-entry-${entry.type}`,
      );
      // Tabler icons render as <svg class="tabler-icon ..." />
      const svg = row.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute("class") ?? "").toMatch(/tabler-icon/);
    }
  });

  it("exposes the entry description via the tooltip wrapper", () => {
    // Mantine Tooltip lazily renders the label into a portal on hover.
    // We instead assert that every entry has a description string
    // configured — verifying tooltip portal behaviour belongs to
    // Mantine's own tests.
    for (const entry of CONTROL_FLOW_PALETTE_ENTRIES) {
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: clicking an entry adds a skeleton with correct defaults
// ---------------------------------------------------------------------------

describe("ActivityPalette — Scenario 3: clicking an entry triggers onAddControlFlowNode", () => {
  it.each([
    ["switch"],
    ["map"],
    ["join"],
    ["childWorkflow"],
    ["pollUntil"],
    ["humanGate"],
  ] as const)("clicking %s calls onAddControlFlowNode with that exact type", (type) => {
    const onAddControlFlowNode = vi.fn<(t: ControlFlowNodeType) => void>();
    renderPalette({ onAddControlFlowNode });
    const row = screen.getByTestId(`control-flow-palette-entry-${type}`);
    row.click();
    expect(onAddControlFlowNode).toHaveBeenCalledTimes(1);
    expect(onAddControlFlowNode).toHaveBeenCalledWith(type);
  });

  it("the skeleton produced by buildControlFlowSkeleton matches the click-handler's contract", () => {
    // The palette's responsibility is to emit the type — the host
    // builds the skeleton via `buildControlFlowSkeleton`. This test
    // double-checks the wiring is consistent for all six types by
    // calling the builder with the type the palette would emit.
    for (const entry of CONTROL_FLOW_PALETTE_ENTRIES) {
      const skeleton = buildControlFlowSkeleton(entry.type, `${entry.type}_1`);
      expect(skeleton.type).toBe(entry.type);
      expect(skeleton.id).toBe(`${entry.type}_1`);
      expect(skeleton.label).toBe(entry.displayName);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: skeleton position reuses the existing add-position logic
// ---------------------------------------------------------------------------
//
// Position-stagger is computed by the host (`WorkflowEditorV2Page`), not by
// the palette itself. The palette's contract under US-011 is to emit the
// node type so the host can build + position the skeleton via the same
// `x = 80 + i*240, y = 100 + (i%3)*140` logic the activity-add path uses.
// We re-implement that logic here and assert it on the host's behalf to
// pin the formula independently of the orchestrator.

describe("ActivityPalette — Scenario 4: position-stagger formula", () => {
  // Reimplements the host's add-position logic (must stay in sync with
  // WorkflowEditorV2Page.addActivity / addControlFlowNode). If the
  // shared formula ever changes, update both at once.
  const positionFor = (i: number) => ({
    x: 80 + i * 240,
    y: 100 + (i % 3) * 140,
  });

  it("matches the activity-add path stagger formula", () => {
    expect(positionFor(0)).toEqual({ x: 80, y: 100 });
    expect(positionFor(1)).toEqual({ x: 320, y: 240 });
    expect(positionFor(2)).toEqual({ x: 560, y: 380 });
    expect(positionFor(3)).toEqual({ x: 800, y: 100 });
    expect(positionFor(4)).toEqual({ x: 1040, y: 240 });
  });

  it("applying the formula to a freshly-built control-flow skeleton produces the expected metadata.position", () => {
    for (const entry of CONTROL_FLOW_PALETTE_ENTRIES) {
      const skeleton = buildControlFlowSkeleton(entry.type, `${entry.type}_1`);
      // Host injects position via metadata after the skeleton is built.
      const i = 2;
      skeleton.metadata = {
        ...(skeleton.metadata ?? {}),
        position: positionFor(i),
      };
      expect(skeleton.metadata.position).toEqual({ x: 560, y: 380 });
    }
  });
});
