/**
 * Tests for WorkflowSettingsDrawer — covers:
 *   - US-070: per-row `isInput` checkbox
 *   - US-098: per-row Kind Select column
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { WorkflowSettingsDrawer } from "./WorkflowSettingsDrawer";

// The drawer reads the merged catalog for its `dyn.*` entries (the G-049
// mismatch walk consults them for dynamic nodes). The real hook needs
// TanStack + group context, so it is stubbed with a stable reference —
// the drawer memoises on `entries` identity.
vi.mock("../dynamic-nodes/useActivityCatalog", () => {
  const catalog = {
    isLoading: false,
    entries: [
      {
        activityType: "dyn.sentiment-scorer",
        category: "custom",
        description: "Scores a document",
        iconHint: "sparkles",
        colorHint: "grape",
        inputs: [
          {
            name: "document",
            label: "Document",
            required: true,
            kind: "Document",
          },
        ],
        outputs: [{ name: "score", label: "Score", kind: "ValidationResult" }],
      },
    ],
    error: null,
  };
  return { useActivityCatalog: () => catalog };
});

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
  onSelectNode = noop,
  onClose = noop,
}: {
  initial: GraphWorkflowConfig;
  onConfig?: (next: GraphWorkflowConfig) => void;
  onSelectNode?: (nodeId: string) => void;
  onClose?: () => void;
}) {
  const [config, setConfig] = useState(initial);
  return (
    <MantineProvider>
      <WorkflowSettingsDrawer
        opened={true}
        onClose={onClose}
        config={config}
        onConfigChange={(next) => {
          setConfig(next);
          onConfig?.(next);
        }}
        onSelectNode={onSelectNode}
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

// ---------------------------------------------------------------------------
// G-009 — what reads this variable, and what writes it
// ---------------------------------------------------------------------------

function makeReferencedConfig(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "Test" },
    entryNodeId: "prep",
    nodes: {
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare the file",
        activityType: "file.prepare",
        outputs: [{ port: "preparedData", ctxKey: "preparedFile" }],
      },
      submit: {
        id: "submit",
        type: "activity",
        label: "Send to OCR",
        activityType: "azureOcr.submit",
        inputs: [{ port: "fileData", ctxKey: "preparedFile" }],
      },
    },
    edges: [],
    ctx: {
      preparedFile: { type: "object" },
      unusedKey: { type: "string" },
    },
  };
}

describe("WorkflowSettingsDrawer — G-009 ctx references", () => {
  it("reports what reads a given ctx variable", () => {
    render(<Harness initial={makeReferencedConfig()} />);
    fireEvent.click(screen.getByTestId("ctx-references-preparedFile"));
    const readers = screen.getByTestId("ctx-readers-preparedFile");
    expect(readers).toHaveTextContent("Send to OCR");
    expect(readers).toHaveTextContent("fileData");
  });

  it("reports what writes it", () => {
    render(<Harness initial={makeReferencedConfig()} />);
    fireEvent.click(screen.getByTestId("ctx-references-preparedFile"));
    const writers = screen.getByTestId("ctx-writers-preparedFile");
    expect(writers).toHaveTextContent("Prepare the file");
    expect(writers).toHaveTextContent("preparedData");
  });

  it("says so when nothing references it", () => {
    render(<Harness initial={makeReferencedConfig()} />);
    fireEvent.click(screen.getByTestId("ctx-references-unusedKey"));
    expect(
      screen.getByTestId("ctx-references-empty-unusedKey"),
    ).toHaveTextContent(/nothing/i);
    expect(screen.queryByTestId("ctx-readers-unusedKey")).toBeNull();
  });

  it("shows the reference count on the trigger before it is opened", () => {
    render(<Harness initial={makeReferencedConfig()} />);
    // 1 reader + 1 writer.
    expect(screen.getByTestId("ctx-references-preparedFile")).toHaveTextContent(
      "2",
    );
    expect(screen.getByTestId("ctx-references-unusedKey")).toHaveTextContent(
      "0",
    );
  });

  it("selects and reveals a referencing node, closing the drawer", () => {
    const onSelectNode = vi.fn();
    const onClose = vi.fn();
    render(
      <Harness
        initial={makeReferencedConfig()}
        onSelectNode={onSelectNode}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId("ctx-references-preparedFile"));
    fireEvent.click(screen.getByTestId("ctx-reference-preparedFile-submit"));
    expect(onSelectNode).toHaveBeenCalledWith("submit");
    // The node is on the canvas, which the drawer covers.
    expect(onClose).toHaveBeenCalled();
  });
});

describe("WorkflowSettingsDrawer — G-074 rename collision", () => {
  const twoKeys = () =>
    makeConfig({
      ctx: {
        customerId: { type: "string" },
        orderId: { type: "string" },
      },
    });

  it("says so when the typed name is already declared", () => {
    render(<Harness initial={twoKeys()} />);
    fireEvent.change(screen.getByLabelText("Name for customerId"), {
      target: { value: "orderId" },
    });
    expect(
      screen.getByText(/“orderId” is already declared/),
    ).toBeInTheDocument();
  });

  it("refuses the rename and keeps what the author typed", () => {
    const onConfig = vi.fn();
    render(<Harness initial={twoKeys()} onConfig={onConfig} />);
    const input = screen.getByLabelText("Name for customerId");
    fireEvent.change(input, { target: { value: "orderId" } });
    fireEvent.blur(input);
    // Not silently reverted — the author still sees the colliding text AND is
    // still told why it did not take. (The pre-fix drawer also left the text
    // in place, so the surviving message is what makes this check bite.)
    expect(input).toHaveValue("orderId");
    expect(
      screen.getByText(/“orderId” is already declared/),
    ).toBeInTheDocument();
    expect(onConfig).not.toHaveBeenCalled();
  });

  it("clears the message and commits once the collision is resolved", () => {
    const onConfig = vi.fn();
    render(<Harness initial={twoKeys()} onConfig={onConfig} />);
    const input = screen.getByLabelText("Name for customerId");
    fireEvent.change(input, { target: { value: "orderId" } });
    fireEvent.change(input, { target: { value: "buyerId" } });
    expect(screen.queryByText(/already declared/)).not.toBeInTheDocument();
    fireEvent.blur(input);
    expect(onConfig).toHaveBeenCalledTimes(1);
    expect(Object.keys(onConfig.mock.calls[0][0].ctx)).toEqual([
      "buyerId",
      "orderId",
    ]);
  });

  it("does not flag a row for its own current name", () => {
    render(<Harness initial={twoKeys()} />);
    fireEvent.change(screen.getByLabelText("Name for customerId"), {
      target: { value: "customerId" },
    });
    expect(screen.queryByText(/already declared/)).not.toBeInTheDocument();
  });
});

describe("WorkflowSettingsDrawer — G-049 kind retype impact", () => {
  /** `B.ocrResult` is PINNED to `myVal`; `ocr.cleanup` types that port. */
  const pinnedConfig = (kind: string) =>
    makeConfig({
      entryNodeId: "B",
      nodes: {
        B: {
          id: "B",
          type: "activity",
          label: "Clean up",
          activityType: "ocr.cleanup",
          inputs: [{ port: "ocrResult", ctxKey: "myVal" }],
          metadata: { lockedInputPorts: ["ocrResult"] },
        },
      },
      ctx: { myVal: { type: "object", kind, isInput: true } },
    } as Partial<GraphWorkflowConfig>);

  it("says nothing while the declared kind still satisfies the pin", () => {
    render(<Harness initial={pinnedConfig("OcrResult")} />);
    expect(screen.queryByTestId("ctx-kind-impact-myVal")).toBeNull();
  });

  it("names what a retype broke, without waiting for the validation drawer", () => {
    render(<Harness initial={pinnedConfig("Document")} />);
    expect(screen.getByTestId("ctx-kind-impact-myVal")).toHaveTextContent(
      "1 input no longer accepts this kind",
    );
  });

  it("reports a dyn node's pinned input through the merged catalog", () => {
    // `dyn.sentiment-scorer` only exists in the merged catalog the mocked
    // hook serves — its `document` port wants `Document`, and `myVal` was
    // retyped to `OcrResult`, so the notice must name the break.
    render(
      <Harness
        initial={makeConfig({
          entryNodeId: "D",
          nodes: {
            D: {
              id: "D",
              type: "activity",
              label: "Score it",
              activityType: "dyn.sentiment-scorer",
              inputs: [{ port: "document", ctxKey: "myVal" }],
              metadata: { lockedInputPorts: ["document"] },
            },
          },
          ctx: {
            myVal: { type: "object", kind: "OcrResult", isInput: true },
          },
        } as Partial<GraphWorkflowConfig>)}
      />,
    );
    expect(screen.getByTestId("ctx-kind-impact-myVal")).toHaveTextContent(
      "1 input no longer accepts this kind",
    );
  });

  it("links straight to the node whose input broke", () => {
    const onSelectNode = vi.fn();
    render(
      <Harness
        initial={pinnedConfig("Document")}
        onSelectNode={onSelectNode}
      />,
    );
    fireEvent.click(screen.getByLabelText(/^Open Clean up —/));
    expect(onSelectNode).toHaveBeenCalledWith("B");
  });
});

describe("WorkflowSettingsDrawer — G-065 run-contract consequence", () => {
  it("says nothing for a variable that is not a caller input", () => {
    render(
      <Harness
        initial={makeConfig({ ctx: { internalCounter: { type: "number" } } })}
      />,
    );
    expect(screen.queryByTestId("ctx-run-contract-internalCounter")).toBeNull();
  });

  it("warns that ticking Input makes callers responsible for the value", () => {
    render(
      <Harness
        initial={makeConfig({ ctx: { customerId: { type: "string" } } })}
      />,
    );
    fireEvent.click(
      screen.getByLabelText("Mark customerId as caller-supplied input"),
    );
    expect(screen.getByTestId("ctx-run-contract-customerId")).toHaveTextContent(
      "Callers must send this when starting a run",
    );
  });

  it("says so when the flag has no effect because an API source supplies inputs", () => {
    render(
      <Harness
        initial={makeConfig({
          entryNodeId: "api",
          nodes: {
            api: {
              id: "api",
              type: "source",
              label: "API",
              sourceType: "source.api",
              parameters: { fields: [] },
            },
          },
          ctx: { customerId: { type: "string", isInput: true } },
        })}
      />,
    );
    expect(screen.getByTestId("ctx-run-contract-customerId")).toHaveTextContent(
      /No effect/,
    );
  });
});

/**
 * P-5 — the drawer's half of constants-on-ports.
 *
 * The hidden `__const_*` declarations are ctx entries, and listing them here
 * would turn every value typed onto a port row into a line in the workflow's
 * vocabulary. The Default value field is the opposite move: the surface for a
 * value worth naming and sharing, which is where a promoted constant lands.
 */
describe("WorkflowSettingsDrawer — P-5 constants and defaults", () => {
  it("keeps hidden port constants out of the ctx list and its count", () => {
    render(
      <Harness
        initial={makeConfig({
          ctx: {
            documentId: { type: "string" },
            __const_n1_fileType: { type: "string", defaultValue: "image" },
          },
        })}
      />,
    );
    expect(screen.getByLabelText("Name for documentId")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name for __const_n1_fileType")).toBeNull();
    // The count beside the section heading counts named declarations only.
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("refuses a rename onto a hidden constant's key, which the list cannot show", () => {
    render(
      <Harness
        initial={makeConfig({
          ctx: {
            documentId: { type: "string" },
            __const_n1_fileType: { type: "string", defaultValue: "image" },
          },
        })}
      />,
    );
    const name = screen.getByLabelText("Name for documentId");
    fireEvent.change(name, { target: { value: "__const_n1_fileType" } });
    expect(screen.getByText(/already declared/)).toBeInTheDocument();
  });

  it("writes a string default verbatim on blur", () => {
    const onConfig = vi.fn();
    render(
      <Harness
        initial={makeConfig({ ctx: { fileType: { type: "string" } } })}
        onConfig={onConfig}
      />,
    );
    const field = screen.getByLabelText("Default value for fileType");
    fireEvent.change(field, { target: { value: "image" } });
    fireEvent.blur(field);
    expect(onConfig).toHaveBeenCalledTimes(1);
    expect(onConfig.mock.calls[0][0].ctx.fileType).toEqual({
      type: "string",
      defaultValue: "image",
    });
  });

  it("parses a non-string default as JSON and reports a type mismatch instead of storing it", () => {
    const onConfig = vi.fn();
    render(
      <Harness
        initial={makeConfig({ ctx: { retries: { type: "number" } } })}
        onConfig={onConfig}
      />,
    );
    const field = screen.getByLabelText("Default value for retries");
    fireEvent.change(field, { target: { value: '"3"' } });
    fireEvent.blur(field);
    expect(screen.getByText("Expected a number")).toBeInTheDocument();
    expect(onConfig).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: "3" } });
    fireEvent.blur(field);
    expect(onConfig.mock.calls[0][0].ctx.retries).toEqual({
      type: "number",
      defaultValue: 3,
    });
  });

  it("clearing the field strips defaultValue rather than storing an empty one", () => {
    const onConfig = vi.fn();
    render(
      <Harness
        initial={makeConfig({
          ctx: { fileType: { type: "string", defaultValue: "image" } },
        })}
        onConfig={onConfig}
      />,
    );
    const field = screen.getByLabelText("Default value for fileType");
    expect(field).toHaveValue("image");
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.blur(field);
    expect(onConfig.mock.calls[0][0].ctx.fileType).toEqual({ type: "string" });
  });
});
