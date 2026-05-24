/**
 * Tests for WorkflowSettingsDrawer — covers:
 *   - US-070: per-row `isInput` checkbox
 *   - US-098: per-row Kind Select column
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { WorkflowSettingsDrawer } from "./WorkflowSettingsDrawer";

function makeConfig(
  overrides: Partial<GraphWorkflowConfig> = {},
): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "Test" },
    entryNodeId: "n1",
    nodes: {
      n1: {
        id: "n1",
        type: "activity",
        label: "Noop",
        activityType: "noop.activity",
      },
    },
    edges: [],
    ctx: {},
    ...overrides,
  };
}

const noop = () => undefined;

function Harness({
  initial,
  onConfig,
}: {
  initial: GraphWorkflowConfig;
  onConfig?: (next: GraphWorkflowConfig) => void;
}) {
  const [config, setConfig] = useState(initial);
  return (
    <MantineProvider>
      <WorkflowSettingsDrawer
        opened={true}
        onClose={noop}
        config={config}
        onConfigChange={(next) => {
          setConfig(next);
          onConfig?.(next);
        }}
      />
    </MantineProvider>
  );
}

describe("WorkflowSettingsDrawer — US-070 isInput checkbox", () => {
  it("renders an Input checkbox per ctx row", () => {
    render(
      <Harness
        initial={makeConfig({
          ctx: {
            customerId: { type: "string" },
            optionalFlag: { type: "boolean" },
          },
        })}
      />,
    );
    const checkboxes = screen.getAllByLabelText(
      /Mark .* as caller-supplied input/,
    );
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it("reflects persisted isInput: true as a checked box", () => {
    render(
      <Harness
        initial={makeConfig({
          ctx: {
            customerId: { type: "string", isInput: true },
            internalCounter: { type: "number" },
          },
        })}
      />,
    );
    const customerCheckbox = screen.getByLabelText(
      "Mark customerId as caller-supplied input",
    );
    const counterCheckbox = screen.getByLabelText(
      "Mark internalCounter as caller-supplied input",
    );
    expect(customerCheckbox).toBeChecked();
    expect(counterCheckbox).not.toBeChecked();
  });

  it("toggles isInput on click (unchecked → true)", () => {
    render(
      <Harness
        initial={makeConfig({
          ctx: { customerId: { type: "string" } },
        })}
      />,
    );
    const checkbox = screen.getByLabelText(
      "Mark customerId as caller-supplied input",
    );
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("toggles isInput off (checked → omitted)", () => {
    render(
      <Harness
        initial={makeConfig({
          ctx: { customerId: { type: "string", isInput: true } },
        })}
      />,
    );
    const checkbox = screen.getByLabelText(
      "Mark customerId as caller-supplied input",
    );
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });
});

describe("WorkflowSettingsDrawer — US-098 Kind Select column", () => {
  it("Scenario 1: renders a Kind Select for each ctx row", () => {
    render(
      <Harness
        initial={makeConfig({
          ctx: {
            customerId: { type: "string" },
            documentRef: { type: "object" },
          },
        })}
      />,
    );
    // One Kind Select rendered per row, addressed by its row-scoped aria-label.
    expect(screen.getByLabelText("Kind for customerId")).toBeInTheDocument();
    expect(screen.getByLabelText("Kind for documentRef")).toBeInTheDocument();
  });

  it("Scenario 2 + 4: legacy rows with no `kind` field render the '—' wildcard option", () => {
    render(
      <Harness
        initial={makeConfig({
          ctx: { legacyVar: { type: "string" } },
        })}
      />,
    );
    const select = screen.getByLabelText(
      "Kind for legacyVar",
    ) as HTMLInputElement;
    expect(select.value).toBe("—");
  });

  it("Scenario 3: picking 'Document' persists `kind: \"Document\"` in the config and re-renders selected", () => {
    let latest: GraphWorkflowConfig | undefined;
    render(
      <Harness
        initial={makeConfig({
          ctx: { customerId: { type: "string" } },
        })}
        onConfig={(next) => {
          latest = next;
        }}
      />,
    );
    fireEvent.click(screen.getByLabelText("Kind for customerId"));
    fireEvent.click(screen.getByRole("option", { name: "Document" }));

    expect(latest?.ctx.customerId.kind).toBe("Document");

    // Re-renders with "Document" still shown.
    const select = screen.getByLabelText(
      "Kind for customerId",
    ) as HTMLInputElement;
    expect(select.value).toBe("Document");
  });

  it("Scenario 4: picking '—' clears `kind` so the field is omitted (not null) and reverts to '—'", () => {
    let latest: GraphWorkflowConfig | undefined;
    render(
      <Harness
        initial={makeConfig({
          ctx: { customerId: { type: "string", kind: "Document" } },
        })}
        onConfig={(next) => {
          latest = next;
        }}
      />,
    );
    fireEvent.click(screen.getByLabelText("Kind for customerId"));
    fireEvent.click(screen.getByRole("option", { name: "—" }));

    // `kind` must be absent in the persisted shape — JSON.stringify drops it.
    expect(latest?.ctx.customerId.kind).toBeUndefined();
    expect("kind" in (latest?.ctx.customerId ?? {})).toBe(false);
    const serialised = JSON.stringify(latest?.ctx.customerId);
    expect(serialised).not.toContain("kind");

    const select = screen.getByLabelText(
      "Kind for customerId",
    ) as HTMLInputElement;
    expect(select.value).toBe("—");
  });

  it("Scenario 5: picking an array variant persists the array-kind literal", () => {
    let latest: GraphWorkflowConfig | undefined;
    render(
      <Harness
        initial={makeConfig({
          ctx: { docs: { type: "array" } },
        })}
        onConfig={(next) => {
          latest = next;
        }}
      />,
    );
    fireEvent.click(screen.getByLabelText("Kind for docs"));
    fireEvent.click(
      screen.getByRole("option", { name: "Multi-page document (array)" }),
    );

    expect(latest?.ctx.docs.kind).toBe("MultiPageDocument[]");

    const select = screen.getByLabelText("Kind for docs") as HTMLInputElement;
    expect(select.value).toBe("Multi-page document (array)");
  });
});
