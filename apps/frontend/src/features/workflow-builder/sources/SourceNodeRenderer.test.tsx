/**
 * Unit tests for `SourceNodeRenderer` (US-117).
 *
 * Each `describe` block maps to one acceptance scenario from
 * feature-docs/20260530-workflow-builder-phase8-document-sources/user_stories/US-117-source-node-renderer.md.
 *
 * `@xyflow/react` is mocked the same way the parent canvas tests mock
 * it — the renderer is invoked directly via React Testing Library so
 * we can assert the rendered DOM (handle presence / colour / tooltip
 * markers / pill anchor) without booting xyflow's runtime.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import type { SourceNode } from "../../../types/workflow";

// ---------------------------------------------------------------------------
// xyflow mock — surfaces a minimal `<Handle>` stub that exposes
// `type` / `position` / `id` as data-* attributes so tests can assert
// the absence of a `type="target"` handle without booting xyflow.
// ---------------------------------------------------------------------------

vi.mock("@xyflow/react", () => {
  return {
    Handle: ({
      type,
      position,
      id,
      style,
    }: {
      type: string;
      position: string;
      id?: string;
      style?: React.CSSProperties;
    }) => (
      <div
        data-testid={`handle-${type}-${position}`}
        data-handle-type={type}
        data-handle-position={position}
        data-handleid={id ?? null}
        data-bg={style?.background as string | undefined}
      />
    ),
    Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
  };
});

import { SourceNodeRenderer } from "./SourceNodeRenderer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSourceNode(overrides: Partial<SourceNode> = {}): SourceNode {
  return {
    id: "src_1",
    type: "source",
    label: "API endpoint",
    sourceType: "source.api",
    parameters: {},
    metadata: { position: { x: 0, y: 0 } },
    ...overrides,
  };
}

function renderRenderer(node: SourceNode, selected = false) {
  // The xyflow `NodeProps` shape has many fields the renderer doesn't
  // actually read at runtime. Build a fully-typed props object via
  // `unknown` so the test setup stays terse without disabling
  // type-checking on the production renderer.
  const props = {
    id: node.id,
    type: "source" as const,
    data: node as SourceNode & Record<string, unknown>,
    selected,
    draggable: false,
    dragging: false,
    zIndex: 0,
    selectable: true,
    deletable: true,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  };
  return render(
    <MantineProvider>
      <SourceNodeRenderer
        {...(props as unknown as React.ComponentProps<
          typeof SourceNodeRenderer
        >)}
      />
    </MantineProvider>,
  );
}

// ---------------------------------------------------------------------------
// Scenario 1: No input handle on the left side
// ---------------------------------------------------------------------------

describe("SourceNodeRenderer — Scenario 1: no input handle", () => {
  it("renders zero `Handle` components with `type='target'` (api)", () => {
    renderRenderer(makeSourceNode({ sourceType: "source.api" }));
    expect(screen.queryByTestId("handle-target-left")).not.toBeInTheDocument();
    // Defence in depth — assert no target handle exists anywhere.
    expect(document.querySelector('[data-handle-type="target"]')).toBeNull();
  });

  it("renders zero `Handle` components with `type='target'` (upload)", () => {
    renderRenderer(makeSourceNode({ sourceType: "source.upload" }));
    expect(document.querySelector('[data-handle-type="target"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Single output handle coloured per `outputKind`
// ---------------------------------------------------------------------------

describe("SourceNodeRenderer — Scenario 2: output handle colour per outputKind", () => {
  it("colours the output handle blue for source.upload (Document)", () => {
    renderRenderer(makeSourceNode({ sourceType: "source.upload" }));
    const wrapper = screen.getByTestId("source-output-handle-wrapper-src_1");
    expect(wrapper.getAttribute("data-port-color")).toBe("blue");
    expect(wrapper.getAttribute("data-port-tooltip")).toBe("Document");
    const handle = screen.getByTestId("handle-source-right");
    expect(handle).toBeInTheDocument();
    // The handle dot picks up the `--mantine-color-blue-6` CSS variable.
    expect(handle.getAttribute("data-bg")).toContain("blue");
  });

  it("colours the output handle gray for source.api (Artifact)", () => {
    renderRenderer(makeSourceNode({ sourceType: "source.api" }));
    const wrapper = screen.getByTestId("source-output-handle-wrapper-src_1");
    expect(wrapper.getAttribute("data-port-color")).toBe("gray");
    expect(wrapper.getAttribute("data-port-tooltip")).toBe("Artifact");
    const handle = screen.getByTestId("handle-source-right");
    expect(handle.getAttribute("data-bg")).toContain("gray");
  });

  it("renders exactly one `type='source'` handle (no extras)", () => {
    renderRenderer(makeSourceNode({ sourceType: "source.api" }));
    const sourceHandles = document.querySelectorAll(
      '[data-handle-type="source"]',
    );
    expect(sourceHandles.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Phase 3 type pill renders on selection
// ---------------------------------------------------------------------------

describe("SourceNodeRenderer — Scenario 3: type pill on selection", () => {
  it("renders the ARTIFACT pill + Fields footnote when source.api is selected", () => {
    renderRenderer(
      makeSourceNode({ sourceType: "source.api" }),
      /* selected */ true,
    );
    const pill = screen.getByTestId("node-type-pill-output");
    expect(pill).toHaveTextContent("ARTIFACT");
    expect(pill.getAttribute("data-pill-color")).toBe("gray");
    // Footnote is a small dimmed text under the pill.
    const footnote = screen.getByTestId("source-node-fields-footnote-src_1");
    expect(footnote).toHaveTextContent(
      "see Settings → Fields for typed field-level kinds",
    );
  });

  it("renders the DOCUMENT pill (no footnote) when source.upload is selected", () => {
    renderRenderer(
      makeSourceNode({ sourceType: "source.upload" }),
      /* selected */ true,
    );
    const pill = screen.getByTestId("node-type-pill-output");
    expect(pill).toHaveTextContent("DOCUMENT");
    expect(pill.getAttribute("data-pill-color")).toBe("blue");
    // No `see Settings → Fields` footnote on source.upload.
    expect(
      screen.queryByTestId("source-node-fields-footnote-src_1"),
    ).not.toBeInTheDocument();
  });

  it("does NOT render the pill when the node is deselected", () => {
    renderRenderer(
      makeSourceNode({ sourceType: "source.api" }),
      /* selected */ false,
    );
    expect(
      screen.queryByTestId("node-type-pill-output"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("source-node-fields-footnote-src_1"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Label / icon / colour sourced from catalog entry
// ---------------------------------------------------------------------------

describe("SourceNodeRenderer — Scenario 4: header from catalog + label override", () => {
  it("shows the catalog displayName and a Tabler icon glyph for source.api", () => {
    renderRenderer(
      makeSourceNode({ sourceType: "source.api", label: "API endpoint" }),
    );
    const displayName = screen.getByTestId("source-node-display-name-src_1");
    expect(displayName).toHaveTextContent("API endpoint");
    // Header icon is rendered via the Tabler component family — they
    // mount as `<svg class="tabler-icon ..." />`.
    const iconWrapper = screen.getByTestId("source-node-icon-src_1");
    const svg = iconWrapper.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("class") ?? "").toMatch(/tabler-icon/);
    // The node has `data-source-type` so consumers (tests + future
    // tooling) can branch on the subtype without reading `data`.
    expect(
      screen.getByTestId("canvas-node-src_1").getAttribute("data-source-type"),
    ).toBe("source.api");
  });

  it("shows the catalog displayName for source.upload (no label override)", () => {
    renderRenderer(
      makeSourceNode({ sourceType: "source.upload", label: "File upload" }),
    );
    const displayName = screen.getByTestId("source-node-display-name-src_1");
    expect(displayName).toHaveTextContent("File upload");
    // Since `label === displayName` the subtitle row is suppressed.
    expect(
      screen.queryByTestId("source-node-label-src_1"),
    ).not.toBeInTheDocument();
  });

  it("renders the user-authored label as a subtitle when it differs from displayName", () => {
    renderRenderer(
      makeSourceNode({
        sourceType: "source.upload",
        label: "Invoices upload",
      }),
    );
    // Header still shows the catalog displayName.
    expect(
      screen.getByTestId("source-node-display-name-src_1"),
    ).toHaveTextContent("File upload");
    // Subtitle row shows the user override.
    const subtitle = screen.getByTestId("source-node-label-src_1");
    expect(subtitle).toHaveTextContent("Invoices upload");
  });
});
