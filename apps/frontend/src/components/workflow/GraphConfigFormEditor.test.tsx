import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GraphWorkflowConfig,
  TransformNode,
} from "../../types/graph-workflow";
import { GraphConfigFormEditor } from "./GraphConfigFormEditor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeTransformNode = (
  overrides: Partial<TransformNode> = {},
): TransformNode => ({
  id: "t1",
  type: "transform",
  label: "My transform",
  inputFormat: "json",
  outputFormat: "json",
  fieldMapping: '{"outputKey": "{{source.field}}"}',
  ...overrides,
});

const makeConfig = (node: TransformNode): GraphWorkflowConfig => ({
  schemaVersion: "1.0",
  metadata: {},
  entryNodeId: node.id,
  nodes: { [node.id]: node },
  edges: [],
  ctx: {},
});

/**
 * Renders GraphConfigFormEditor inside MantineProvider with a transform node.
 */
function renderEditor(node: TransformNode, onChange = vi.fn()) {
  const config = makeConfig(node);
  return render(
    <MantineProvider>
      <GraphConfigFormEditor value={config} onChange={onChange} />
    </MantineProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GraphConfigFormEditor — TransformNodeForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe("Scenario 1: format dropdowns display and persist selections", () => {
    it("shows the current inputFormat and outputFormat values in the inputs", () => {
      renderEditor(
        makeTransformNode({ inputFormat: "csv", outputFormat: "xml" }),
      );

      // getAllByLabelText because Mantine Select associates the label with both
      // the visible input and the hidden listbox element
      const inputFormatInput = screen
        .getAllByLabelText("Input format")
        .find((el) => el.tagName === "INPUT") as HTMLInputElement;
      const outputFormatInput = screen
        .getAllByLabelText("Output format")
        .find((el) => el.tagName === "INPUT") as HTMLInputElement;

      expect(inputFormatInput.value).toBe("CSV");
      expect(outputFormatInput.value).toBe("XML");
    });

    it("calls onChange with updated inputFormat when a new format is selected", async () => {
      const onChange = vi.fn();
      renderEditor(makeTransformNode({ inputFormat: "json" }), onChange);

      const inputFormatInput = screen
        .getAllByLabelText("Input format")
        .find((el) => el.tagName === "INPUT") as HTMLInputElement;
      fireEvent.click(inputFormatInput);

      const csvOption = await screen.findByRole("option", { name: "CSV" });
      fireEvent.click(csvOption);

      expect(onChange).toHaveBeenCalled();
      const updatedConfig: GraphWorkflowConfig = onChange.mock.calls[0][0];
      const updatedNode = updatedConfig.nodes.t1 as TransformNode;
      expect(updatedNode.inputFormat).toBe("csv");
    });

    it("calls onChange with updated outputFormat when a new format is selected", async () => {
      const onChange = vi.fn();
      renderEditor(makeTransformNode({ outputFormat: "json" }), onChange);

      const outputFormatInput = screen
        .getAllByLabelText("Output format")
        .find((el) => el.tagName === "INPUT") as HTMLInputElement;
      fireEvent.click(outputFormatInput);

      const xmlOption = await screen.findByRole("option", { name: "XML" });
      fireEvent.click(xmlOption);

      expect(onChange).toHaveBeenCalled();
      const updatedConfig: GraphWorkflowConfig = onChange.mock.calls[0][0];
      const updatedNode = updatedConfig.nodes.t1 as TransformNode;
      expect(updatedNode.outputFormat).toBe("xml");
    });
  });

  describe("Scenario 2: mapping textarea displays and updates fieldMapping", () => {
    it("renders the textarea with the current fieldMapping content", () => {
      const mapping = '{"key": "{{nodeName.field}}"}';
      renderEditor(makeTransformNode({ fieldMapping: mapping }));

      const textarea = screen.getByRole("textbox", { name: /field mapping/i });
      expect(textarea).toHaveValue(mapping);
    });

    it("calls onChange with updated fieldMapping when the textarea changes", () => {
      const onChange = vi.fn();
      renderEditor(makeTransformNode({ fieldMapping: "{}" }), onChange);

      const textarea = screen.getByRole("textbox", { name: /field mapping/i });
      fireEvent.change(textarea, { target: { value: '{"a":"b"}' } });

      expect(onChange).toHaveBeenCalled();
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
      const updatedConfig: GraphWorkflowConfig = lastCall[0];
      const updatedNode = updatedConfig.nodes.t1 as TransformNode;
      expect(updatedNode.fieldMapping).toBe('{"a":"b"}');
    });
  });

  describe("Scenario 3: file upload replaces fieldMapping", () => {
    it("reads a .json file and updates fieldMapping with its content", async () => {
      const onChange = vi.fn();
      renderEditor(makeTransformNode({ fieldMapping: "{}" }), onChange);

      const newMapping = '{"uploaded": "{{src.val}}"}';
      const file = new File([newMapping], "mapping.json", {
        type: "application/json",
      });

      // Stub FileReader as a class
      const mockReadAsText = vi.fn();
      class MockFileReader {
        result: string | null = null;
        onload: ((e: ProgressEvent<FileReader>) => void) | null = null;

        readAsText(_f: Blob) {
          this.result = newMapping;
          this.onload?.({
            target: this,
          } as unknown as ProgressEvent<FileReader>);
        }
      }
      vi.stubGlobal("FileReader", MockFileReader);
      // silence unused var warning
      void mockReadAsText;

      const fileInput = document.querySelector(
        'input[type="file"][accept=".json"]',
      ) as HTMLInputElement;
      expect(fileInput).toBeTruthy();

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
        const updatedConfig: GraphWorkflowConfig =
          onChange.mock.calls[onChange.mock.calls.length - 1][0];
        const updatedNode = updatedConfig.nodes.t1 as TransformNode;
        expect(updatedNode.fieldMapping).toBe(newMapping);
      });
    });
  });

  describe("Scenario 4: download button exports mapping.json", () => {
    it("creates a blob URL and triggers download when Download mapping is clicked", () => {
      const fakeUrl = "blob:fake-url";
      vi.spyOn(URL, "createObjectURL").mockReturnValue(fakeUrl);
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

      const clickSpy = vi.fn();
      const mockAnchor = { href: "", download: "", click: clickSpy };
      // Save original before spying to avoid infinite recursion
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        if (tag === "a") return mockAnchor as unknown as HTMLElement;
        return originalCreateElement(tag);
      });

      const mapping = '{"key": "{{n.f}}"}';
      renderEditor(makeTransformNode({ fieldMapping: mapping }));

      const downloadBtn = screen.getByRole("button", {
        name: /download mapping/i,
      });
      fireEvent.click(downloadBtn);

      expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(mockAnchor.download).toBe("mapping.json");
      expect(clickSpy).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(fakeUrl);
    });

    it("disables Download mapping button when fieldMapping is empty", () => {
      renderEditor(makeTransformNode({ fieldMapping: "" }));

      const downloadBtn = screen.getByRole("button", {
        name: /download mapping/i,
      });
      expect(downloadBtn).toBeDisabled();
    });
  });

  describe("Scenario 5: placeholder explains binding syntax", () => {
    it("shows placeholder text mentioning the binding syntax when fieldMapping is empty", () => {
      renderEditor(makeTransformNode({ fieldMapping: "" }));

      const textarea = screen.getByRole("textbox", { name: /field mapping/i });
      expect(textarea).toHaveAttribute("placeholder");
      expect(textarea.getAttribute("placeholder")).toMatch(
        /\{\{nodeName\.fieldName\}\}/,
      );
    });
  });
});
