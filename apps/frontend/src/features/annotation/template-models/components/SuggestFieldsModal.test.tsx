import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@bcgov/design-system-react-components", () =>
  import("../../../../test/mockBcdsComponents").then((mod) =>
    mod.mockBcdsDesignSystem(),
  ),
);

const mockSuggestFieldsAsync = vi.fn();

vi.mock("../hooks/useFieldSuggestions", () => ({
  useFieldSuggestions: () => ({
    suggestFieldsAsync: mockSuggestFieldsAsync,
    isSuggestingFields: false,
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

function renderModal() {
  const props = {
    opened: true,
    onClose: vi.fn(),
    templateModelId: "tm-1",
    documents: [{ id: "doc-1", name: "copy-1.pdf" }],
    onAddFields: vi.fn().mockResolvedValue(undefined),
    onFieldsAdded: vi.fn(),
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

describe("SuggestFieldsModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSuggestFieldsAsync.mockResolvedValue(suggestions);
  });

  it("suggests fields for the first document and leaves existing keys unticked", async () => {
    renderModal();
    await suggest();

    expect(mockSuggestFieldsAsync).toHaveBeenCalledWith("doc-1");
    expect(
      within(screen.getByTestId("suggested-field-0")).getByRole("checkbox"),
    ).toBeChecked();
    expect(
      within(screen.getByTestId("suggested-field-1")).getByRole("checkbox"),
    ).not.toBeChecked();
    expect(
      screen.getByText("Not filled in on this document"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add 2 fields" }),
    ).toBeInTheDocument();
  });

  it("adds the ticked fields with the user's edits", async () => {
    const props = renderModal();
    await suggest();

    fireEvent.change(
      within(screen.getByTestId("suggested-field-0")).getByLabelText("Key"),
      { target: { value: "court_file_number" } },
    );
    fireEvent.click(
      within(screen.getByTestId("suggested-field-2")).getByRole("checkbox"),
    );
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
