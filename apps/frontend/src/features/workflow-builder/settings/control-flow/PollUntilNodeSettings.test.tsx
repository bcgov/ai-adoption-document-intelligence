/**
 * Tests for PollUntilNodeSettings (US-008).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260522-workflow-builder-control-flow-nodes/user_stories/US-008-poll-until-node-settings.md.
 */

import "@testing-library/jest-dom";

import { ACTIVITY_CATALOG } from "@ai-di/graph-workflow";
import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  ConditionExpression,
  GraphNode,
  GraphWorkflowConfig,
  PollUntilNode,
} from "../../../../types/workflow";
import { PollUntilNodeSettings } from "./PollUntilNodeSettings";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(nodes: GraphNode[]): GraphWorkflowConfig {
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
    ctx: {},
  };
}

const EMPTY_CONDITION: ConditionExpression = {
  operator: "equals",
  left: { ref: "" },
  right: { ref: "" },
};

function pollUntilNode(
  id: string,
  label: string,
  overrides: Partial<PollUntilNode> = {},
): PollUntilNode {
  return {
    id,
    type: "pollUntil",
    label,
    activityType: "",
    condition: { ...EMPTY_CONDITION },
    interval: "30s",
    ...overrides,
  };
}

function renderSettings(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

/**
 * Convenience wrapper so a test can mount the form once, then poke at the
 * latest `onConfigChange` payload via the spy while the form stays in sync
 * with the most recent value.
 */
function mountWithSpy(
  initialConfig: GraphWorkflowConfig,
  pollUntilNodeId: string,
) {
  const spy = vi.fn<(next: GraphWorkflowConfig) => void>();

  function Wrapper() {
    const [config, setConfig] = useState<GraphWorkflowConfig>(initialConfig);
    const node = config.nodes[pollUntilNodeId] as PollUntilNode;
    return (
      <PollUntilNodeSettings
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
// Scenario 1: activityType is a Select populated from ACTIVITY_CATALOG
// ---------------------------------------------------------------------------

describe("PollUntilNodeSettings — Scenario 1: activityType Select populated from ACTIVITY_CATALOG", () => {
  it("opens to show every catalog activity grouped by category, and picking one updates the node via onConfigChange", () => {
    // Sanity: the catalog has the 41 entries the story is written against.
    const entries = Object.values(ACTIVITY_CATALOG);
    expect(entries).toHaveLength(41);

    const initial = pollUntilNode("p1", "Poll");
    const config = makeConfig([initial]);

    const { spy } = mountWithSpy(config, "p1");

    const select = screen.getByTestId("poll-until-node-settings-activity-type");
    fireEvent.click(select);

    // All 41 activity displayName entries appear in the listbox.
    // We assert via getAllByRole("option") so duplicate display names (if any)
    // still count once per occurrence.
    const options = screen.getAllByRole("option");
    expect(options.length).toBe(entries.length);

    // Every catalog displayName is present in the dropdown.
    for (const entry of entries) {
      expect(
        screen.getAllByText(entry.displayName ?? entry.activityType).length,
      ).toBeGreaterThan(0);
    }

    // Every distinct CatalogCategory appears as a group header in the
    // dropdown.
    const distinctCategories = new Set(entries.map((entry) => entry.category));
    for (const category of distinctCategories) {
      expect(screen.getAllByText(category).length).toBeGreaterThan(0);
    }

    // Pick the "azureClassify.poll" activity by clicking its option.
    const targetEntry = entries.find(
      (entry) => entry.activityType === "azureClassify.poll",
    );
    if (!targetEntry) {
      throw new Error("Catalog must contain azureClassify.poll for this test");
    }
    const targetOption = screen.getByRole("option", {
      name: new RegExp(targetEntry.displayName ?? targetEntry.activityType),
    });
    fireEvent.click(targetOption);

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updated = next.nodes.p1 as PollUntilNode;
    expect(updated.activityType).toBe("azureClassify.poll");
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: JsonSchemaForm renders the chosen activity's parametersSchema
// ---------------------------------------------------------------------------

describe("PollUntilNodeSettings — Scenario 2: JsonSchemaForm renders for parameters once activityType is set", () => {
  it("mounting with activityType=azureOcr.submit renders the JsonSchemaForm and parameter edits propagate to onConfigChange", () => {
    // azureOcr.submit has a non-empty parametersSchema (a `locale` field), so
    // the JsonSchemaForm will actually render an editable widget for it.
    const entry = Object.values(ACTIVITY_CATALOG).find(
      (e) => e.activityType === "azureOcr.submit",
    );
    if (!entry) {
      throw new Error("Catalog must contain azureOcr.submit for this test");
    }

    const initial = pollUntilNode("p1", "Poll", {
      activityType: "azureOcr.submit",
    });
    const config = makeConfig([initial]);

    const { spy } = mountWithSpy(config, "p1");

    // The parameters block is rendered (only shown when activityType is set).
    const parametersBlock = screen.getByTestId(
      "poll-until-node-settings-parameters",
    );
    expect(parametersBlock).toBeInTheDocument();

    // The `locale` field rendered by JsonSchemaForm is reachable inside the
    // parameters block. Mantine's Select wires the visible label to the
    // underlying input via `htmlFor`, so `getByLabelText("Locale")` returns
    // the right input.
    const localeInput = within(parametersBlock).getByLabelText(
      "Locale",
    ) as HTMLInputElement;
    fireEvent.click(localeInput);

    // Pick the "fr-FR" option (Azure locales include it).
    const frOption = screen.getByRole("option", { name: "fr-FR" });
    fireEvent.click(frOption);

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updated = next.nodes.p1 as PollUntilNode;
    expect(updated.activityType).toBe("azureOcr.submit");
    expect(updated.parameters).toEqual({ locale: "fr-FR" });
  });

  it("changing activityType clears any previously-set parameters", () => {
    const initial = pollUntilNode("p1", "Poll", {
      activityType: "azureOcr.submit",
      parameters: { locale: "fr-FR" },
    });
    const config = makeConfig([initial]);

    const { spy } = mountWithSpy(config, "p1");

    const select = screen.getByTestId("poll-until-node-settings-activity-type");
    fireEvent.click(select);
    // Pick azureClassify.poll — switching activity types drops `parameters`.
    const option = screen.getByRole("option", { name: /Poll Classify/ });
    fireEvent.click(option);

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updated = next.nodes.p1 as PollUntilNode;
    expect(updated.activityType).toBe("azureClassify.poll");
    expect(updated.parameters).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: condition uses ConditionExpressionEditor
// ---------------------------------------------------------------------------

describe("PollUntilNodeSettings — Scenario 3: condition uses ConditionExpressionEditor", () => {
  it("the ConditionExpressionEditor is mounted for the condition field and edits propagate as a ConditionExpression", () => {
    const initial = pollUntilNode("p1", "Poll");
    const config = makeConfig([initial]);

    const { spy } = mountWithSpy(config, "p1");

    // The condition editor is mounted under the documented test-id.
    const editor = screen.getByTestId("poll-until-node-settings-condition");
    expect(editor).toBeInTheDocument();
    // Sanity: the comparison-body chrome from ConditionExpressionEditor is
    // present, confirming the right primitive mounted.
    expect(
      within(editor).getByTestId(
        "poll-until-node-settings-condition-body-comparison",
      ),
    ).toBeInTheDocument();

    // Author `equals(ctx.status, "completed")`:
    //   - left ValueRef: switch to ref mode (default) and type "ctx.status".
    //   - right ValueRef: switch to literal mode and type "completed".
    const leftRef = screen.getByTestId(
      "poll-until-node-settings-condition-left-ref-input",
    ) as HTMLInputElement;
    fireEvent.change(leftRef, { target: { value: "ctx.status" } });

    // Switch the right operand to literal mode.
    const rightMode = screen.getByTestId(
      "poll-until-node-settings-condition-right-mode",
    );
    const literalSegment = within(rightMode).getByDisplayValue("literal");
    fireEvent.click(literalSegment);

    const rightLiteral = screen.getByTestId(
      "poll-until-node-settings-condition-right-literal-input",
    ) as HTMLInputElement;
    fireEvent.change(rightLiteral, { target: { value: "completed" } });

    expect(spy).toHaveBeenCalled();
    const latest = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updated = latest.nodes.p1 as PollUntilNode;

    // The committed condition matches equals(ctx.status, "completed").
    expect(updated.condition).toEqual({
      operator: "equals",
      left: { ref: "ctx.status" },
      right: { literal: "completed" },
    });
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: interval is a TextInput validated as a Temporal duration
// ---------------------------------------------------------------------------

describe("PollUntilNodeSettings — Scenario 4: interval is validated as a Temporal duration", () => {
  it("'30s' commits, 'abc' shows an inline error and is not propagated, '5m' commits", () => {
    const initial = pollUntilNode("p1", "Poll", { interval: "1s" });
    const config = makeConfig([initial]);

    const { spy } = mountWithSpy(config, "p1");

    const intervalInput = screen.getByTestId(
      "poll-until-node-settings-interval",
    ) as HTMLInputElement;

    // ── 1) '30s' is accepted and propagated. ─────────────────────────────
    fireEvent.change(intervalInput, { target: { value: "30s" } });
    const after30s = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    expect((after30s.nodes.p1 as PollUntilNode).interval).toBe("30s");
    const callCountAfter30s = spy.mock.calls.length;
    // Valid drafts clear `aria-invalid` on the underlying input.
    expect(intervalInput).toHaveAttribute("aria-invalid", "false");

    // ── 2) 'abc' is rejected — no new onConfigChange and an error shows. ─
    fireEvent.change(intervalInput, { target: { value: "abc" } });
    // The committed interval still reads as "30s" because invalid drafts
    // are not propagated.
    expect(spy.mock.calls.length).toBe(callCountAfter30s);
    const lastValidNode = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    expect((lastValidNode.nodes.p1 as PollUntilNode).interval).toBe("30s");
    // An inline error is surfaced — Mantine wires `aria-invalid="true"` on
    // the input when `error` is truthy.
    expect(intervalInput).toHaveAttribute("aria-invalid", "true");

    // ── 3) '5m' is accepted and propagated. ──────────────────────────────
    fireEvent.change(intervalInput, { target: { value: "5m" } });
    const after5m = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    expect((after5m.nodes.p1 as PollUntilNode).interval).toBe("5m");
    // Once a valid value is entered, the aria-invalid flag clears.
    expect(intervalInput).toHaveAttribute("aria-invalid", "false");
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Optional fields maxAttempts, initialDelay, timeout toggle
// between set and undefined, with duration-format validation on the durations.
// ---------------------------------------------------------------------------

describe("PollUntilNodeSettings — Scenario 5: optional fields toggle and validate", () => {
  it("setting and clearing each of maxAttempts / initialDelay / timeout toggles the node field on/off, with duration validation on the two duration fields", () => {
    const initial = pollUntilNode("p1", "Poll");
    const config = makeConfig([initial]);

    const { spy } = mountWithSpy(config, "p1");

    // ── maxAttempts: set to 10, then clear ───────────────────────────────
    const maxAttemptsInput = screen.getByTestId(
      "poll-until-node-settings-max-attempts",
    ) as HTMLInputElement;
    fireEvent.change(maxAttemptsInput, { target: { value: "10" } });
    {
      const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
      const updated = next.nodes.p1 as PollUntilNode;
      expect(updated.maxAttempts).toBe(10);
    }
    fireEvent.change(maxAttemptsInput, { target: { value: "" } });
    {
      const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
      const updated = next.nodes.p1 as PollUntilNode;
      expect(updated.maxAttempts).toBeUndefined();
    }

    // ── initialDelay: set to "5s" (valid), then clear ────────────────────
    const initialDelayInput = screen.getByTestId(
      "poll-until-node-settings-initial-delay",
    ) as HTMLInputElement;
    fireEvent.change(initialDelayInput, { target: { value: "5s" } });
    {
      const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
      const updated = next.nodes.p1 as PollUntilNode;
      expect(updated.initialDelay).toBe("5s");
    }
    // Validation: an invalid draft should not propagate, and surface an
    // inline error.
    fireEvent.change(initialDelayInput, { target: { value: "abc" } });
    expect(initialDelayInput).toHaveAttribute("aria-invalid", "true");
    {
      const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
      const updated = next.nodes.p1 as PollUntilNode;
      // Still set to "5s" (the last valid commit).
      expect(updated.initialDelay).toBe("5s");
    }
    fireEvent.change(initialDelayInput, { target: { value: "" } });
    {
      const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
      const updated = next.nodes.p1 as PollUntilNode;
      expect(updated.initialDelay).toBeUndefined();
    }

    // ── timeout: set to "10m" (valid), then clear ────────────────────────
    const timeoutInput = screen.getByTestId(
      "poll-until-node-settings-timeout",
    ) as HTMLInputElement;
    fireEvent.change(timeoutInput, { target: { value: "10m" } });
    {
      const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
      const updated = next.nodes.p1 as PollUntilNode;
      expect(updated.timeout).toBe("10m");
    }
    // Invalid draft does not propagate and surfaces an error.
    fireEvent.change(timeoutInput, { target: { value: "zzz" } });
    expect(timeoutInput).toHaveAttribute("aria-invalid", "true");
    {
      const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
      const updated = next.nodes.p1 as PollUntilNode;
      // Still set to "10m" (the last valid commit).
      expect(updated.timeout).toBe("10m");
    }
    fireEvent.change(timeoutInput, { target: { value: "" } });
    {
      const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
      const updated = next.nodes.p1 as PollUntilNode;
      expect(updated.timeout).toBeUndefined();
    }
  });
});
