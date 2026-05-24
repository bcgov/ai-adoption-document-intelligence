/**
 * Unit tests for `SourceNodeSettings` (US-119).
 *
 * Each `describe` block maps to one acceptance scenario from
 * feature-docs/20260530-workflow-builder-phase8-document-sources/user_stories/US-119-source-node-settings-panel.md.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GraphWorkflowConfig, SourceNode } from "../../../types/workflow";
import { SourceNodeSettings } from "./SourceNodeSettings";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSourceApiNode(overrides: Partial<SourceNode> = {}): SourceNode {
  return {
    id: "src-api-1",
    type: "source",
    label: "API endpoint",
    sourceType: "source.api",
    parameters: { fields: [] },
    ...overrides,
  };
}

function makeSourceUploadNode(overrides: Partial<SourceNode> = {}): SourceNode {
  return {
    id: "src-upload-1",
    type: "source",
    label: "File upload",
    sourceType: "source.upload",
    parameters: {
      allowedMimeTypes: ["application/pdf", "image/*"],
      maxFileSizeMB: 50,
      ctxKey: "documentUrl",
    },
    ...overrides,
  };
}

function makeConfig(node: SourceNode): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: node.id,
    nodes: { [node.id]: node },
    edges: [],
    ctx: {},
  };
}

function renderPanel(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

// ---------------------------------------------------------------------------
// Scenario 2: Header surfaces displayName + description + icon
// ---------------------------------------------------------------------------

describe("SourceNodeSettings — Scenario 2: header content", () => {
  it("renders the catalog displayName + description + icon for source.api", () => {
    const node = makeSourceApiNode();
    const config = makeConfig(node);
    const onConfigChange = vi.fn();

    renderPanel(
      <SourceNodeSettings
        node={node}
        config={config}
        onConfigChange={onConfigChange}
      />,
    );

    expect(
      screen.getByTestId("source-node-settings-display-name"),
    ).toHaveTextContent("API endpoint");
    expect(
      screen.getByText(
        /Programmatic intake — callers POST JSON matching the declared field shape/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("source-node-settings-icon")).toBeInTheDocument();
  });

  it("renders the catalog displayName + description + icon for source.upload", () => {
    const node = makeSourceUploadNode();
    const config = makeConfig(node);
    const onConfigChange = vi.fn();

    renderPanel(
      <SourceNodeSettings
        node={node}
        config={config}
        onConfigChange={onConfigChange}
      />,
    );

    expect(
      screen.getByTestId("source-node-settings-display-name"),
    ).toHaveTextContent("File upload");
    expect(
      screen.getByText(
        /Interactive intake — the canvas-side Dropzone uploads a file/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("source-node-settings-icon")).toBeInTheDocument();
  });

  it("renders a label-override subtitle when node.label differs from the catalog displayName", () => {
    const node = makeSourceApiNode({ label: "Intake from CRM" });
    const config = makeConfig(node);
    const onConfigChange = vi.fn();

    renderPanel(
      <SourceNodeSettings
        node={node}
        config={config}
        onConfigChange={onConfigChange}
      />,
    );

    expect(
      screen.getByTestId("source-node-settings-label-override"),
    ).toHaveTextContent("Intake from CRM");
  });

  it("does NOT render a label-override subtitle when node.label matches the catalog displayName", () => {
    const node = makeSourceApiNode({ label: "API endpoint" });
    const config = makeConfig(node);
    const onConfigChange = vi.fn();

    renderPanel(
      <SourceNodeSettings
        node={node}
        config={config}
        onConfigChange={onConfigChange}
      />,
    );

    expect(
      screen.queryByTestId("source-node-settings-label-override"),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Body renders JsonSchemaForm against parametersSchema
// ---------------------------------------------------------------------------

describe("SourceNodeSettings — Scenario 3: form body renders the right fields", () => {
  it("source.api renders 2 fields (fields[] + authNotes?)", () => {
    const node = makeSourceApiNode();
    const config = makeConfig(node);
    const onConfigChange = vi.fn();

    renderPanel(
      <SourceNodeSettings
        node={node}
        config={config}
        onConfigChange={onConfigChange}
      />,
    );

    const panel = screen.getByTestId("source-node-settings");
    // Field titles (from the Zod `.meta({ title })`). The `fields` parameter
    // dispatches to the FieldListEditor x-widget which renders its own
    // "Fields" section heading — so "Fields" appears twice (once from
    // JsonSchemaForm's outer label, once from the rich widget's heading).
    expect(within(panel).getAllByText("Fields").length).toBeGreaterThanOrEqual(
      1,
    );
    expect(within(panel).getByText("Auth notes")).toBeInTheDocument();
  });

  it("source.upload renders 3 fields (allowedMimeTypes + maxFileSizeMB + ctxKey)", () => {
    const node = makeSourceUploadNode();
    const config = makeConfig(node);
    const onConfigChange = vi.fn();

    renderPanel(
      <SourceNodeSettings
        node={node}
        config={config}
        onConfigChange={onConfigChange}
      />,
    );

    const panel = screen.getByTestId("source-node-settings");
    expect(within(panel).getByText("Allowed MIME types")).toBeInTheDocument();
    expect(within(panel).getByText("Max file size (MB)")).toBeInTheDocument();
    expect(within(panel).getByText("Ctx key")).toBeInTheDocument();
  });

  it("editing a form field calls onConfigChange with the updated node.parameters", () => {
    const node = makeSourceUploadNode();
    const config = makeConfig(node);
    const onConfigChange = vi.fn();

    renderPanel(
      <SourceNodeSettings
        node={node}
        config={config}
        onConfigChange={onConfigChange}
      />,
    );

    // Mantine's TextInput renders the label as a separate <label> sibling,
    // not as a `<label for>` association — fall back to selecting the
    // ctxKey input by its initial display value (the schema default
    // "documentUrl" is what `node.parameters.ctxKey` carries).
    const ctxKeyInput = screen.getByDisplayValue(
      "documentUrl",
    ) as HTMLInputElement;
    fireEvent.change(ctxKeyInput, { target: { value: "uploadedUrl" } });

    expect(onConfigChange).toHaveBeenCalled();
    const next = onConfigChange.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updated = next.nodes["src-upload-1"] as SourceNode;
    expect(updated.type).toBe("source");
    expect(updated.sourceType).toBe("source.upload");
    expect((updated.parameters as Record<string, unknown>).ctxKey).toBe(
      "uploadedUrl",
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 (partial): unknown sourceType shows error message
// ---------------------------------------------------------------------------

describe("SourceNodeSettings — unknown sourceType handling", () => {
  it("renders an error message when the sourceType is not registered in the catalog", () => {
    const node: SourceNode = {
      id: "bad",
      type: "source",
      label: "Bogus",
      sourceType: "source.does-not-exist",
      parameters: {},
    };
    const config = makeConfig(node);
    const onConfigChange = vi.fn();

    renderPanel(
      <SourceNodeSettings
        node={node}
        config={config}
        onConfigChange={onConfigChange}
      />,
    );

    expect(
      screen.getByTestId("source-node-settings-unknown"),
    ).toHaveTextContent("Unknown source type: source.does-not-exist");
  });
});
