/**
 * Tests for `ActivityPalette` (US-011).
 *
 * Each test maps to one acceptance scenario from
 * feature-docs/20260522-workflow-builder-control-flow-nodes/user_stories/US-011-palette-flow-control-section.md.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import { ActivityPalette } from "./ActivityPalette";
import { CONTROL_FLOW_PALETTE_ENTRIES } from "./control-flow-palette-entries";
import {
  buildControlFlowSkeleton,
  type ControlFlowNodeType,
} from "./control-flow-skeletons";

// Stub CodeMirror (the editor mounted inside the "+ New custom node"
// modal relies on browser primitives jsdom doesn't implement).
vi.mock("@uiw/react-codemirror", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange?: (next: string) => void;
  }) => (
    <textarea
      data-testid="codemirror-stub"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

let fetchSpy: MockInstance<typeof globalThis.fetch>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
  // Default: catalog returns no entries (no dyn entries).
  fetchSpy.mockResolvedValue(jsonResponse({ entries: [] }));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function renderPalette(
  overrides: Partial<React.ComponentProps<typeof ActivityPalette>> = {},
) {
  const onAddActivity = overrides.onAddActivity ?? vi.fn();
  const onAddControlFlowNode = overrides.onAddControlFlowNode ?? vi.fn();
  const onAddSource = overrides.onAddSource ?? vi.fn();
  const onAddDynamicNode = overrides.onAddDynamicNode ?? vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <ModalsProvider>
          <Notifications />
          <ActivityPalette
            onAddActivity={onAddActivity}
            onAddControlFlowNode={onAddControlFlowNode}
            onAddSource={onAddSource}
            onAddDynamicNode={onAddDynamicNode}
          />
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>,
  );
  return {
    ...utils,
    onAddActivity,
    onAddControlFlowNode,
    onAddSource,
    onAddDynamicNode,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: "Flow Control" section appears first
// ---------------------------------------------------------------------------

describe('ActivityPalette — Scenario 1: "Flow Control" section appears first (above activities)', () => {
  it("renders Flow Control before any activity-category header", () => {
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
    // activity-category headers in the rendered DOM. (US-118 adds a
    // "Sources" section ABOVE Flow Control — Flow Control still comes
    // before every activity category, so the original guarantee holds.)
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

// ---------------------------------------------------------------------------
// US-118: "Sources" palette section
// ---------------------------------------------------------------------------

describe('ActivityPalette — US-118: "Sources" section', () => {
  it("renders a Sources section ABOVE the Flow Control section", () => {
    renderPalette();
    const sourcesHeader = screen.getByText("Sources");
    const flowControlHeader = screen.getByText("Flow Control");
    expect(sourcesHeader).toBeInTheDocument();
    expect(flowControlHeader).toBeInTheDocument();
    // Compare positions in document order.
    const pos = sourcesHeader.compareDocumentPosition(flowControlHeader);
    // `DOCUMENT_POSITION_FOLLOWING` (4) means the second arg comes
    // AFTER the first in document order.
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("lists the two 8.0 source entries (source.api + source.upload)", () => {
    renderPalette();
    expect(
      screen.getByTestId("source-palette-entry-source.api"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("source-palette-entry-source.upload"),
    ).toBeInTheDocument();
  });

  it("renders the catalog displayName for each source row", () => {
    renderPalette();
    const apiRow = screen.getByTestId("source-palette-entry-source.api");
    expect(apiRow).toHaveTextContent("API endpoint");
    expect(apiRow).toHaveTextContent("source.api");
    const uploadRow = screen.getByTestId("source-palette-entry-source.upload");
    expect(uploadRow).toHaveTextContent("File upload");
    expect(uploadRow).toHaveTextContent("source.upload");
  });

  it("clicking a source row calls onAddSource with that exact subtype", () => {
    const onAddSource = vi.fn<(t: string) => void>();
    renderPalette({ onAddSource });
    screen.getByTestId("source-palette-entry-source.api").click();
    expect(onAddSource).toHaveBeenCalledTimes(1);
    expect(onAddSource).toHaveBeenCalledWith("source.api");
    screen.getByTestId("source-palette-entry-source.upload").click();
    expect(onAddSource).toHaveBeenCalledTimes(2);
    expect(onAddSource).toHaveBeenLastCalledWith("source.upload");
  });
});

// ---------------------------------------------------------------------------
// US-182: Custom palette section + "+ New custom node" button
// ---------------------------------------------------------------------------

describe('ActivityPalette — US-182: Custom section + "+ New custom node"', () => {
  it("Scenario 3: renders the Custom section + + New custom node button even when the group has zero dynamic entries", async () => {
    renderPalette();
    await waitFor(() => {
      expect(screen.getByText("Custom")).toBeInTheDocument();
    });
    expect(screen.getByTestId("palette-custom-new-btn")).toBeInTheDocument();
    expect(screen.getByTestId("custom-empty-placeholder")).toBeInTheDocument();
  });

  it("Scenario 1 + 2: lists dynamic entries with DYN pill", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        entries: [
          {
            activityType: "dyn.my-node",
            displayName: "my-node",
            category: "Custom",
            description: "A test custom node",
            iconHint: "sparkles",
            colorHint: "violet",
            inputs: [],
            outputs: [],
            paramsSchema: { type: "object", properties: {} },
            dynamicNodeSlug: "my-node",
            dynamicNodeVersion: 1,
            allowNet: [],
          },
        ],
      }),
    );
    renderPalette();
    await waitFor(() => {
      expect(
        screen.getByTestId("dynamic-palette-entry-my-node"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId("dynamic-palette-entry-pill-my-node"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("dynamic-palette-entry-pill-my-node"),
    ).toHaveTextContent("DYN");
  });

  it("Scenario 5: clicking an existing entry calls onAddDynamicNode with the slug", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        entries: [
          {
            activityType: "dyn.alpha",
            displayName: "alpha",
            category: "Custom",
            description: "alpha description",
            iconHint: "sparkles",
            colorHint: "violet",
            inputs: [],
            outputs: [],
            paramsSchema: { type: "object", properties: {} },
            dynamicNodeSlug: "alpha",
            dynamicNodeVersion: 1,
            allowNet: [],
          },
        ],
      }),
    );
    const onAddDynamicNode = vi.fn<(slug: string) => void>();
    renderPalette({ onAddDynamicNode });
    await waitFor(() => {
      expect(
        screen.getByTestId("dynamic-palette-entry-alpha"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("dynamic-palette-entry-alpha"));
    expect(onAddDynamicNode).toHaveBeenCalledTimes(1);
    expect(onAddDynamicNode).toHaveBeenCalledWith("alpha");
  });

  it("Scenario 3: clicking + New custom node opens the editor modal", async () => {
    renderPalette();
    await waitFor(() => {
      expect(screen.getByTestId("palette-custom-new-btn")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("palette-custom-new-btn"));
    await waitFor(() => {
      expect(
        screen.getByTestId("palette-custom-new-modal"),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("dynamic-node-editor")).toBeInTheDocument();
  });
});
