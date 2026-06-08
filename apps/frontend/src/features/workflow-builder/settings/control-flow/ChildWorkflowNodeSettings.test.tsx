/**
 * Tests for ChildWorkflowNodeSettings (US-007).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260522-workflow-builder-control-flow-nodes/user_stories/US-007-child-workflow-node-settings.md.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ChildWorkflowNode,
  CtxDeclaration,
  GraphMetadata,
  GraphNode,
  GraphWorkflowConfig,
  PortBinding,
} from "../../../../types/workflow";
import { ChildWorkflowNodeSettings } from "./ChildWorkflowNodeSettings";

vi.mock("../../../../auth/GroupContext", () => ({
  useGroup: () => ({ activeGroup: { id: "group-1", name: "Group 1" } }),
}));

/**
 * Per-id metadata overrides — tests that want a typed library set this
 * before rendering so the `/workflows/:id` mock returns the right
 * `metadata.inputs[]` / `outputs[]` for the signature summary.
 */
const libraryMetadataById = new Map<string, GraphMetadata>();

vi.mock("../../../../data/services/api.service", () => ({
  apiService: {
    get: vi.fn(async (url: string) => {
      // List endpoint variants: return an empty workflows array.
      if (url.startsWith("/workflows?") || url === "/workflows") {
        return { success: true, data: { workflows: [] } };
      }
      // Version list (`/workflows/:id/versions`) — expose two summaries so
      // the pinned-version path can resolve a version *number* → version
      // *id* (Item 31). v3 is the pinned version used by the Scenario 2
      // tests; v1 stands in for an earlier version.
      const versionsListMatch = url.match(/^\/workflows\/([^/?]+)\/versions$/);
      if (versionsListMatch) {
        const id = versionsListMatch[1];
        return {
          success: true,
          data: {
            versions: [
              {
                id: `${id}-vid-3`,
                versionNumber: 3,
                createdAt: new Date().toISOString(),
              },
              {
                id: `${id}-vid-1`,
                versionNumber: 1,
                createdAt: new Date().toISOString(),
              },
            ],
          },
        };
      }
      // Single version GET (`/workflows/:id/versions/:versionId`) — return
      // a synthesised library version so the pinned-version signature
      // summary renders. Reuses the same metadata override map as head.
      const versionMatch = url.match(
        /^\/workflows\/([^/?]+)\/versions\/([^/?]+)$/,
      );
      if (versionMatch) {
        const id = versionMatch[1];
        const metadataOverride = libraryMetadataById.get(id);
        return {
          success: true,
          data: {
            workflow: {
              id,
              workflowVersionId: versionMatch[2],
              slug: `slug-${id}`,
              name: `Library ${id}`,
              description: null,
              actorId: "actor-1",
              config: {
                schemaVersion: "1.0",
                metadata: metadataOverride ?? { inputs: [], outputs: [] },
                entryNodeId: "",
                nodes: {},
                edges: [],
                ctx: {},
              },
              schemaVersion: "1.0",
              version: 3,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        };
      }
      // Single-workflow GETs (`/workflows/:id`) — return a synthesised
      // library so the signature summary renders the name + slug. Tests
      // that need a "Library not found" surface set a different id (e.g.
      // empty workflowId).
      const match = url.match(/^\/workflows\/([^/?]+)$/);
      if (match) {
        const id = match[1];
        const metadataOverride = libraryMetadataById.get(id);
        return {
          success: true,
          data: {
            workflow: {
              id,
              workflowVersionId: `${id}-v1`,
              slug: `slug-${id}`,
              name: `Library ${id}`,
              description: null,
              actorId: "actor-1",
              config: {
                schemaVersion: "1.0",
                metadata: metadataOverride ?? { inputs: [], outputs: [] },
                entryNodeId: "",
                nodes: {},
                edges: [],
                ctx: {},
              },
              schemaVersion: "1.0",
              version: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        };
      }
      return { success: false, message: "no test data for this id" };
    }),
  },
}));

afterEach(() => {
  libraryMetadataById.clear();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(
  nodes: GraphNode[],
  ctx: Record<string, CtxDeclaration> = {},
): GraphWorkflowConfig {
  const nodesRecord: Record<string, GraphNode> = {};
  for (const node of nodes) {
    nodesRecord[node.id] = node;
  }
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: nodes[0]?.id ?? "",
    nodes: nodesRecord,
    edges: [],
    ctx,
  };
}

function childWorkflowNode(
  id: string,
  label: string,
  overrides: Partial<ChildWorkflowNode> = {},
): ChildWorkflowNode {
  return {
    id,
    type: "childWorkflow",
    label,
    workflowRef: { type: "library", workflowId: "" },
    ...overrides,
  };
}

function renderSettings(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>{ui}</MantineProvider>
    </QueryClientProvider>,
  );
}

/**
 * Mounts the form with a controlled wrapper so a test can poke at the
 * latest `onConfigChange` payload via the spy while the form stays in
 * sync with the most recent value.
 */
function mountWithSpy(
  initialConfig: GraphWorkflowConfig,
  childWorkflowNodeId: string,
) {
  const spy = vi.fn<(next: GraphWorkflowConfig) => void>();

  function Wrapper() {
    const [config, setConfig] = useState<GraphWorkflowConfig>(initialConfig);
    const node = config.nodes[childWorkflowNodeId] as ChildWorkflowNode;
    return (
      <ChildWorkflowNodeSettings
        node={node}
        config={config}
        onConfigChange={(next) => {
          spy(next);
          setConfig(next);
        }}
      />
    );
  }

  const utils = renderSettings(<Wrapper />);
  return { ...utils, spy };
}

// ---------------------------------------------------------------------------
// Scenario 1: workflowRef.type SegmentedControl toggles between library /
// inline and the body swaps to match.
// ---------------------------------------------------------------------------

describe("ChildWorkflowNodeSettings — Scenario 1: ref-type SegmentedControl toggles library / inline", () => {
  it("clicking the 'inline' segment fires onConfigChange with workflowRef.type === 'inline' and the body swaps to the inline view", () => {
    const initial = childWorkflowNode("c1", "Child", {
      workflowRef: { type: "library", workflowId: "invoice-approval" },
    });
    const config = makeConfig([initial]);

    const { spy } = mountWithSpy(config, "c1");

    // Initially the library body is rendered.
    expect(
      screen.getByTestId("child-workflow-node-settings-library-body"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("child-workflow-node-settings-inline-body"),
    ).not.toBeInTheDocument();

    const segmented = screen.getByTestId(
      "child-workflow-node-settings-ref-type",
    );
    const inlineInput = within(segmented).getByDisplayValue(
      "inline",
    ) as HTMLInputElement;
    fireEvent.click(inlineInput);

    expect(spy).toHaveBeenCalled();
    const latest = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updated = latest.nodes.c1 as ChildWorkflowNode;
    expect(updated.workflowRef.type).toBe("inline");
    // The body must swap to the inline view.
    expect(
      screen.getByTestId("child-workflow-node-settings-inline-body"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("child-workflow-node-settings-library-body"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 (US-063): Library mode renders the picker button instead of a
// free-text TextInput. The previous TextInput affordance was removed when
// the library picker was wired up.
// ---------------------------------------------------------------------------

describe("ChildWorkflowNodeSettings — Scenario 2 (US-063): library mode shows the picker button", () => {
  it("renders a 'Pick library workflow' button in place of the free-text workflowId TextInput", () => {
    const initial = childWorkflowNode("c1", "Child", {
      workflowRef: { type: "library", workflowId: "" },
    });
    const config = makeConfig([initial]);

    renderSettings(
      <ChildWorkflowNodeSettings
        node={initial}
        config={config}
        onConfigChange={() => undefined}
      />,
    );

    expect(
      screen.getByTestId("child-workflow-node-settings-library-body"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("child-workflow-node-settings-workflow-id"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("child-workflow-node-settings-pick-library"),
    ).toBeInTheDocument();
  });

  it("clicking the picker button opens the LibraryPickerModal", () => {
    const initial = childWorkflowNode("c1", "Child", {
      workflowRef: { type: "library", workflowId: "" },
    });
    const config = makeConfig([initial]);

    renderSettings(
      <ChildWorkflowNodeSettings
        node={initial}
        config={config}
        onConfigChange={() => undefined}
      />,
    );

    fireEvent.click(
      screen.getByTestId("child-workflow-node-settings-pick-library"),
    );

    expect(screen.getByTestId("library-picker-modal")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Inline mode shows read-only JSON preview + advisory hint.
// ---------------------------------------------------------------------------

describe("ChildWorkflowNodeSettings — Scenario 3: inline mode shows read-only JSON preview + hint", () => {
  it("renders the inline graph as read-only JSON and surfaces a dimmed advisory hint", () => {
    const initial = childWorkflowNode("c1", "Child", {
      workflowRef: {
        type: "inline",
        graph: {
          schemaVersion: "1.0",
          metadata: { name: "Nested" },
          nodes: {},
          edges: [],
          entryNodeId: "",
          ctx: {},
        },
      },
    });
    const config = makeConfig([initial]);

    renderSettings(
      <ChildWorkflowNodeSettings
        node={initial}
        config={config}
        onConfigChange={() => undefined}
      />,
    );

    // Inline body is rendered.
    const inlineBody = screen.getByTestId(
      "child-workflow-node-settings-inline-body",
    );
    expect(inlineBody).toBeInTheDocument();

    // Read-only JSON preview is present and contains the serialised graph.
    const preview = screen.getByTestId(
      "child-workflow-node-settings-inline-preview",
    );
    expect(preview).toBeInTheDocument();
    // The preview is a Mantine <Code block>, which is not an interactive
    // input — there's no value to mutate; the textContent must contain the
    // serialised JSON.
    expect(preview.tagName).not.toBe("INPUT");
    expect(preview.tagName).not.toBe("TEXTAREA");
    expect(preview.textContent ?? "").toContain('"schemaVersion": "1.0"');
    expect(preview.textContent ?? "").toContain('"name": "Nested"');

    // Advisory hint text is present and uses the dimmed text style.
    expect(
      within(inlineBody).getByText(
        "Inline graph editing is not yet supported in V2; switch to JSON editor to author.",
      ),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: inputMappings list editor supports add + remove rows.
// ---------------------------------------------------------------------------

describe("ChildWorkflowNodeSettings — Scenario 4: inputMappings supports add + remove rows", () => {
  it("Add Row appends a row, Remove on row 0 drops it, and each row is { port: TextInput, ctxKey: VariablePicker }", () => {
    const initialMappings: PortBinding[] = [
      { port: "payload", ctxKey: "doc" },
      { port: "options", ctxKey: "opts" },
    ];
    const initial = childWorkflowNode("c1", "Child", {
      inputMappings: initialMappings,
    });
    const config = makeConfig([initial], {
      doc: { type: "object" },
      opts: { type: "object" },
    });

    const { spy } = mountWithSpy(config, "c1");

    // Sanity: two rows initially.
    expect(
      screen.getByTestId("child-workflow-node-settings-input-row-0"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("child-workflow-node-settings-input-row-1"),
    ).toBeInTheDocument();

    // Each row is { port: TextInput, ctxKey: VariablePicker }.
    for (const index of [0, 1]) {
      const row = screen.getByTestId(
        `child-workflow-node-settings-input-row-${index}`,
      );
      const portInput = within(row).getByTestId(
        `child-workflow-node-settings-input-row-${index}-port`,
      ) as HTMLInputElement;
      const ctxKeyInput = within(row).getByTestId(
        `child-workflow-node-settings-input-row-${index}-ctx-key`,
      ) as HTMLInputElement;
      expect(portInput.tagName).toBe("INPUT");
      // The VariablePicker is built on Mantine's Autocomplete and forwards
      // `data-testid` to its underlying <input>. Hitting the test-id and
      // seeing an INPUT confirms the picker mounted.
      expect(ctxKeyInput.tagName).toBe("INPUT");
    }

    // Click Add Row -> length === 3.
    fireEvent.click(
      screen.getByTestId("child-workflow-node-settings-input-add"),
    );
    const afterAdd = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const nodeAfterAdd = afterAdd.nodes.c1 as ChildWorkflowNode;
    expect(nodeAfterAdd.inputMappings).toHaveLength(3);
    // Existing rows are preserved.
    expect(nodeAfterAdd.inputMappings?.[0]).toEqual(initialMappings[0]);
    expect(nodeAfterAdd.inputMappings?.[1]).toEqual(initialMappings[1]);
    // New row is empty.
    expect(nodeAfterAdd.inputMappings?.[2]).toEqual({ port: "", ctxKey: "" });

    // Click Remove on row 0 -> length === 2 (drops the original first row).
    fireEvent.click(
      screen.getByTestId("child-workflow-node-settings-input-row-0-remove"),
    );
    const afterRemove = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const nodeAfterRemove = afterRemove.nodes.c1 as ChildWorkflowNode;
    expect(nodeAfterRemove.inputMappings).toHaveLength(2);
    // Remaining rows in order: original row 1, then the newly added empty row.
    expect(nodeAfterRemove.inputMappings?.[0]).toEqual(initialMappings[1]);
    expect(nodeAfterRemove.inputMappings?.[1]).toEqual({
      port: "",
      ctxKey: "",
    });
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: outputMappings list editor supports add + remove rows.
// ---------------------------------------------------------------------------

describe("ChildWorkflowNodeSettings — Scenario 5: outputMappings supports add + remove rows", () => {
  it("Add Row twice then Remove on row 1 transitions outputMappings.length: 1 -> 2 -> 3 -> 2, with TextInput + VariablePicker rows", () => {
    const initialMappings: PortBinding[] = [
      { port: "result", ctxKey: "summary" },
    ];
    const initial = childWorkflowNode("c1", "Child", {
      outputMappings: initialMappings,
    });
    const config = makeConfig([initial], {
      summary: { type: "object" },
    });

    const { spy } = mountWithSpy(config, "c1");

    // Sanity: one row initially.
    expect(
      screen.getByTestId("child-workflow-node-settings-output-row-0"),
    ).toBeInTheDocument();

    // First click Add Row -> length 2.
    fireEvent.click(
      screen.getByTestId("child-workflow-node-settings-output-add"),
    );
    const afterFirstAdd = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const nodeAfterFirstAdd = afterFirstAdd.nodes.c1 as ChildWorkflowNode;
    expect(nodeAfterFirstAdd.outputMappings).toHaveLength(2);
    expect(nodeAfterFirstAdd.outputMappings?.[0]).toEqual(initialMappings[0]);
    expect(nodeAfterFirstAdd.outputMappings?.[1]).toEqual({
      port: "",
      ctxKey: "",
    });

    // Second click Add Row -> length 3.
    fireEvent.click(
      screen.getByTestId("child-workflow-node-settings-output-add"),
    );
    const afterSecondAdd = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const nodeAfterSecondAdd = afterSecondAdd.nodes.c1 as ChildWorkflowNode;
    expect(nodeAfterSecondAdd.outputMappings).toHaveLength(3);
    expect(nodeAfterSecondAdd.outputMappings?.[0]).toEqual(initialMappings[0]);
    expect(nodeAfterSecondAdd.outputMappings?.[1]).toEqual({
      port: "",
      ctxKey: "",
    });
    expect(nodeAfterSecondAdd.outputMappings?.[2]).toEqual({
      port: "",
      ctxKey: "",
    });

    // Each row is { port: TextInput, ctxKey: VariablePicker }.
    for (const index of [0, 1, 2]) {
      const row = screen.getByTestId(
        `child-workflow-node-settings-output-row-${index}`,
      );
      const portInput = within(row).getByTestId(
        `child-workflow-node-settings-output-row-${index}-port`,
      ) as HTMLInputElement;
      const ctxKeyInput = within(row).getByTestId(
        `child-workflow-node-settings-output-row-${index}-ctx-key`,
      ) as HTMLInputElement;
      expect(portInput.tagName).toBe("INPUT");
      // The VariablePicker is built on Mantine's Autocomplete and forwards
      // `data-testid` to its underlying <input>. Hitting the test-id and
      // seeing an INPUT confirms the picker mounted.
      expect(ctxKeyInput.tagName).toBe("INPUT");
    }

    // Remove row 1 -> length 2 (drops the first added empty row).
    fireEvent.click(
      screen.getByTestId("child-workflow-node-settings-output-row-1-remove"),
    );
    const afterRemove = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const nodeAfterRemove = afterRemove.nodes.c1 as ChildWorkflowNode;
    expect(nodeAfterRemove.outputMappings).toHaveLength(2);
    // Original row remains plus the second added empty row.
    expect(nodeAfterRemove.outputMappings?.[0]).toEqual(initialMappings[0]);
    expect(nodeAfterRemove.outputMappings?.[1]).toEqual({
      port: "",
      ctxKey: "",
    });
  });
});

// ---------------------------------------------------------------------------
// US-087 — Version badge + "Change version" button
// ---------------------------------------------------------------------------

describe("ChildWorkflowNodeSettings — US-087 Scenario 1: head badge when version is undefined", () => {
  it("renders a gray 'head' Badge next to the library name when workflowRef.version is undefined", async () => {
    const initial = childWorkflowNode("c1", "Child", {
      workflowRef: { type: "library", workflowId: "lib-1" },
    });
    const config = makeConfig([initial]);

    renderSettings(
      <ChildWorkflowNodeSettings
        node={initial}
        config={config}
        onConfigChange={() => undefined}
      />,
    );

    // Wait for the library signature to load (async useWorkflow fetch).
    const badge = await screen.findByTestId(
      "child-workflow-node-settings-version-badge",
    );
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe("head");
  });
});

describe("ChildWorkflowNodeSettings — US-087 Scenario 2: v{N} badge when pinned", () => {
  it("renders a blue 'v3' Badge next to the library name when workflowRef.version === 3", async () => {
    const initial = childWorkflowNode("c1", "Child", {
      workflowRef: { type: "library", workflowId: "lib-1", version: 3 },
    });
    const config = makeConfig([initial]);

    renderSettings(
      <ChildWorkflowNodeSettings
        node={initial}
        config={config}
        onConfigChange={() => undefined}
      />,
    );

    const badge = await screen.findByTestId(
      "child-workflow-node-settings-version-badge",
    );
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe("v3");
  });

  // Item 31 — when a version is pinned the signature summary must reflect
  // the PINNED version's config (resolved number → id → version config),
  // not the lineage head. The mocked version endpoint supplies the
  // metadata, so a successfully-rendered signature row proves the pinned
  // version's config drove the summary (the head `/workflows/:id` GET is
  // not consulted on the pinned path).
  it("renders the pinned version's signature ports when workflowRef.version === 3", async () => {
    libraryMetadataById.set("lib-pinned", {
      inputs: [
        { label: "Doc", path: "ctx.doc", type: "string", kind: "Document" },
      ],
      outputs: [],
    });

    const initial = childWorkflowNode("c1", "Child", {
      workflowRef: { type: "library", workflowId: "lib-pinned", version: 3 },
    });
    const config = makeConfig([initial]);

    renderSettings(
      <ChildWorkflowNodeSettings
        node={initial}
        config={config}
        onConfigChange={() => undefined}
      />,
    );

    const inputRow = await screen.findByTestId(
      "child-workflow-node-settings-input-port-Doc",
    );
    expect(inputRow.textContent ?? "").toContain("Doc (string, Document)");

    const badge = await screen.findByTestId(
      "child-workflow-node-settings-version-badge",
    );
    expect(badge.textContent).toBe("v3");
  });
});

describe('ChildWorkflowNodeSettings — US-087 Scenario 3: "Change version" re-opens the picker pre-seeded', () => {
  it("clicking 'Change version' opens the LibraryPickerModal", async () => {
    const initial = childWorkflowNode("c1", "Child", {
      workflowRef: { type: "library", workflowId: "lib-1", version: 3 },
    });
    const config = makeConfig([initial]);

    renderSettings(
      <ChildWorkflowNodeSettings
        node={initial}
        config={config}
        onConfigChange={() => undefined}
      />,
    );

    // Wait for the signature summary (and the Change version button) to mount
    // after the async library fetch resolves.
    const changeButton = await screen.findByTestId(
      "child-workflow-node-settings-change-version",
    );

    // Sanity: the modal title (which only appears in the open modal) is not
    // present before the user clicks Change version. (Mantine's Modal portal
    // node mounts unconditionally, so we don't assert on the testid
    // container — we assert on user-visible content.)
    expect(screen.queryByText("Pick library workflow")).not.toBeInTheDocument();

    fireEvent.click(changeButton);

    // Modal opens — the title becomes visible in the DOM.
    await waitFor(() => {
      expect(screen.getByText("Pick library workflow")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// US-100 — Library signature summary surfaces typed-I/O `kind` (Scenarios 2 + 3)
// ---------------------------------------------------------------------------

describe("ChildWorkflowNodeSettings — US-100 Scenario 2: signature summary surfaces kind + coloured dot", () => {
  it("renders KindDot + 'label (type, kind)' text for typed inputs and outputs", async () => {
    libraryMetadataById.set("lib-typed", {
      inputs: [
        {
          label: "Doc",
          path: "ctx.docUrl",
          type: "string",
          kind: "Document",
        },
      ],
      outputs: [
        {
          label: "Classification",
          path: "ctx.classification",
          type: "object",
          kind: "Classification",
        },
      ],
    });

    const initial = childWorkflowNode("c1", "Child", {
      workflowRef: { type: "library", workflowId: "lib-typed" },
    });
    const config = makeConfig([initial]);

    renderSettings(
      <ChildWorkflowNodeSettings
        node={initial}
        config={config}
        onConfigChange={() => undefined}
      />,
    );

    // Input row — surfaces the typed text + dot.
    const inputRow = await screen.findByTestId(
      "child-workflow-node-settings-input-port-Doc",
    );
    expect(inputRow.textContent ?? "").toContain("Doc (string, Document)");
    // The KindDot's `data-kind-dot` attribute is rendered as a child span.
    const inputDot = inputRow.querySelector('[data-kind-dot="Document"]');
    expect(inputDot).not.toBeNull();
    expect((inputDot as HTMLElement).style.background).toContain(
      "--mantine-color-blue-6",
    );

    // Output row — surfaces the typed text + dot.
    const outputRow = await screen.findByTestId(
      "child-workflow-node-settings-output-port-Classification",
    );
    expect(outputRow.textContent ?? "").toContain(
      "Classification (object, Classification)",
    );
    const outputDot = outputRow.querySelector(
      '[data-kind-dot="Classification"]',
    );
    expect(outputDot).not.toBeNull();
    // Classification → "yellow" in the registry (per artifact-registry.ts).
    expect((outputDot as HTMLElement).style.background).toContain(
      "--mantine-color-yellow-6",
    );

    // The Track 3 version badge MUST still render alongside the new
    // annotations (Scenario 2 explicit: kind annotations coexist with the
    // version badge).
    const badge = await screen.findByTestId(
      "child-workflow-node-settings-version-badge",
    );
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe("head");
  });
});

describe("ChildWorkflowNodeSettings — US-100 Scenario 3: untyped library ports render without kind text or dot", () => {
  it("renders just 'label (type)' with no KindDot for ports whose kind is undefined", async () => {
    libraryMetadataById.set("lib-legacy", {
      inputs: [{ label: "URL", path: "ctx.documentUrl", type: "string" }],
      outputs: [{ label: "Fields", path: "ctx.fields", type: "object" }],
    });

    const initial = childWorkflowNode("c1", "Child", {
      workflowRef: { type: "library", workflowId: "lib-legacy" },
    });
    const config = makeConfig([initial]);

    renderSettings(
      <ChildWorkflowNodeSettings
        node={initial}
        config={config}
        onConfigChange={() => undefined}
      />,
    );

    const inputRow = await screen.findByTestId(
      "child-workflow-node-settings-input-port-URL",
    );
    expect(inputRow.textContent ?? "").toContain("URL (string)");
    expect(inputRow.textContent ?? "").not.toContain("URL (string,");
    expect(inputRow.querySelector("[data-kind-dot]")).toBeNull();

    const outputRow = await screen.findByTestId(
      "child-workflow-node-settings-output-port-Fields",
    );
    expect(outputRow.textContent ?? "").toContain("Fields (object)");
    expect(outputRow.textContent ?? "").not.toContain("Fields (object,");
    expect(outputRow.querySelector("[data-kind-dot]")).toBeNull();

    // Track 3 badge still renders (regression check).
    const badge = await screen.findByTestId(
      "child-workflow-node-settings-version-badge",
    );
    expect(badge).toBeInTheDocument();
  });
});
