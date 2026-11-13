import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@bcgov/design-system-react-components", () =>
  import("../../../../test/mockBcdsComponents").then((mod) =>
    mod.mockBcdsDesignSystem(),
  ),
);

const mockSuggestFieldsAsync = vi.fn();
let mockIsSuggestingFields = false;

vi.mock("../hooks/useFieldSuggestions", () => ({
  useFieldSuggestions: () => ({
    suggestFieldsAsync: mockSuggestFieldsAsync,
    isSuggestingFields: mockIsSuggestingFields,
  }),
}));

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MantineProvider } from "../../../../ui";
import { FieldType } from "../../core/types/field";
import { SuggestFieldsModal } from "./SuggestFieldsModal";

const suggestions = [
  {
    field_key: "file_number",
    field_type: FieldType.STRING,
    description: "Court file number after 'No.'",
    value: "S-251234",
    page_number: 1,
    already_exists: false,
  },
  {
    field_key: "consents",
    field_type: FieldType.SELECTION_MARK,
    description: "Ticked when the defendant consents",
    value: "selected",
    page_number: 1,
    already_exists: true,
  },
  {
    field_key: "filing_date",
    field_type: FieldType.DATE,
    description: "Date at the bottom",
    value: null,
    page_number: null,
    already_exists: false,
  },
];

function renderModal(
  overrides: Partial<{
    documents: { id: string; name: string }[];
    existingKeys: string[];
  }> = {},
) {
  const props = {
    opened: true,
    onClose: vi.fn(),
    templateModelId: "tm-1",
    documents: [{ id: "doc-1", name: "copy-1.pdf" }],
    existingKeys: ["consents"],
    onAddFields: vi.fn().mockResolvedValue(undefined),
    onFieldsAdded: vi.fn(),
    ...overrides,
  };
  render(
    <MantineProvider>
      <SuggestFieldsModal {...props} />
    </MantineProvider>,
  );
  return props;
}

async function suggest() {
  fireEvent.click(screen.getByRole("button", { name: "Suggest" }));
  await waitFor(() =>
    expect(screen.getByTestId("suggested-field-2")).toBeInTheDocument(),
  );
}

function rowCheckbox(index: number) {
  return within(screen.getByTestId(`suggested-field-${index}`)).getByRole(
    "checkbox",
  );
}

describe("SuggestFieldsModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSuggestingFields = false;
    mockSuggestFieldsAsync.mockResolvedValue(suggestions);
  });

  it("suggests fields for the first document and leaves existing keys unticked", async () => {
    renderModal();
    await suggest();

    expect(mockSuggestFieldsAsync).toHaveBeenCalledWith("doc-1");
    expect(rowCheckbox(0)).toBeChecked();
    expect(rowCheckbox(1)).not.toBeChecked();
    expect(
      screen.getByText("Not filled in on this document"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add 2 fields" }),
    ).toBeInTheDocument();
  });

  it("shows each field's description and the value found, under column headers", async () => {
    renderModal();
    await suggest();

    for (const header of [
      "Key",
      "Type",
      "Description",
      "Found on this document",
    ]) {
      expect(
        screen.getByRole("columnheader", { name: header }),
      ).toBeInTheDocument();
    }
    const firstRow = within(screen.getByTestId("suggested-field-0"));
    expect(firstRow.getByLabelText("Description")).toHaveValue(
      "Court file number after 'No.'",
    );
    expect(firstRow.getByText("S-251234")).toBeInTheDocument();
    expect(firstRow.getByLabelText("Include file_number")).toBeChecked();
    expect(
      within(screen.getByTestId("suggested-field-1")).getByText(
        "Already in schema",
      ),
    ).toBeInTheDocument();
  });

  it("adds the ticked fields with the user's edits", async () => {
    const props = renderModal();
    await suggest();

    fireEvent.change(
      within(screen.getByTestId("suggested-field-0")).getByLabelText("Key"),
      { target: { value: "court_file_number" } },
    );
    fireEvent.click(rowCheckbox(2));
    fireEvent.click(screen.getByRole("button", { name: "Add 1 field" }));

    await waitFor(() =>
      expect(props.onFieldsAdded).toHaveBeenCalledWith("doc-1", 1),
    );
    expect(props.onAddFields).toHaveBeenCalledWith([
      {
        field_key: "court_file_number",
        field_type: FieldType.STRING,
        description: "Court file number after 'No.'",
      },
    ]);
    expect(props.onClose).toHaveBeenCalled();
  });

  it("flags a key renamed into one already in the schema, and blocks adding it", async () => {
    renderModal();
    await suggest();

    fireEvent.change(
      within(screen.getByTestId("suggested-field-0")).getByLabelText("Key"),
      { target: { value: "consents" } },
    );

    expect(
      within(screen.getByTestId("suggested-field-0")).getByText(
        "Already in schema",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/already in the schema or used twice: consents/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 2 fields" })).toBeDisabled();
  });

  it("ticks and unticks every new field from the header, leaving existing ones alone", async () => {
    renderModal();
    await suggest();

    const all = screen.getByLabelText("Include all new fields");
    expect(all).toBeChecked();

    fireEvent.click(all);
    expect(rowCheckbox(0)).not.toBeChecked();
    expect(rowCheckbox(2)).not.toBeChecked();

    fireEvent.click(all);
    expect(rowCheckbox(0)).toBeChecked();
    expect(rowCheckbox(1)).not.toBeChecked();
    expect(rowCheckbox(2)).toBeChecked();
  });

  it("says what is happening while the model reads the document, and locks the inputs", () => {
    mockIsSuggestingFields = true;
    renderModal();

    expect(screen.getByTestId("suggest-fields-progress")).toHaveTextContent(
      "Reading copy-1.pdf. This can take up to a minute.",
    );
    expect(screen.getByRole("button", { name: "Suggest" })).toBeDisabled();
  });

  it("drops a reply that arrives after the window was closed", async () => {
    let resolveReply: ((value: typeof suggestions) => void) | undefined;
    mockSuggestFieldsAsync.mockReturnValue(
      new Promise((resolve) => {
        resolveReply = resolve;
      }),
    );
    const props = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Suggest" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    resolveReply?.(suggestions);

    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(screen.queryByTestId("suggested-field-0")).not.toBeInTheDocument();
  });

  it("clears the suggestions when another document is picked", async () => {
    renderModal({
      documents: [
        { id: "doc-1", name: "copy-1.pdf" },
        { id: "doc-2", name: "copy-2.pdf" },
      ],
    });
    await suggest();

    fireEvent.click(screen.getByTestId("select-option-doc-2"));

    expect(screen.queryByTestId("suggested-field-0")).not.toBeInTheDocument();
  });

  it("shows the error when suggesting fails", async () => {
    mockSuggestFieldsAsync.mockRejectedValue(
      new Error("Label suggestions are not configured"),
    );
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Suggest" }));

    expect(
      await screen.findByText("Label suggestions are not configured"),
    ).toBeInTheDocument();
  });
});
