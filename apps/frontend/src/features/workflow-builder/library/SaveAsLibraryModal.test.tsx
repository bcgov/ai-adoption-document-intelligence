/**
 * Tests for `SaveAsLibraryModal` (US-059 + US-060 + US-061).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260526-workflow-builder-phase2-library-workflows/user_stories/
 * (US-060-save-as-library-modal-fields.md + US-061-save-as-library-creates-new-record.md).
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SaveAsLibraryModal } from "./SaveAsLibraryModal";

function renderModal(
  overrides?: Partial<React.ComponentProps<typeof SaveAsLibraryModal>>,
) {
  const onClose = vi.fn();
  const onSubmit = vi.fn();
  const props = {
    opened: true,
    onClose,
    initialName: "Initial name",
    initialDescription: "Initial description",
    isSaving: false,
    onSubmit,
    ...overrides,
  };
  const utils = render(
    <MantineProvider>
      <SaveAsLibraryModal {...props} />
    </MantineProvider>,
  );
  return { ...utils, onClose, onSubmit };
}

describe("SaveAsLibraryModal — Scenario 2 (US-060): Name + Description prefill from initial props", () => {
  it("prefills the Name and Description fields from the initialName / initialDescription props", () => {
    renderModal({
      initialName: "Invoice classifier",
      initialDescription: "Detects invoice subtypes",
    });

    const name = screen.getByTestId("save-as-library-name") as HTMLInputElement;
    const description = screen.getByTestId(
      "save-as-library-description",
    ) as HTMLTextAreaElement;
    expect(name.value).toBe("Invoice classifier");
    expect(description.value).toBe("Detects invoice subtypes");
  });
});

describe("SaveAsLibraryModal — Scenario 3 (US-060): Inputs editor adds + removes rows", () => {
  it("Add row appends a row and Remove drops it from the inputs list", () => {
    renderModal();

    // No rows yet — only the empty state is shown.
    expect(
      screen.queryByTestId("save-as-library-inputs-row-0"),
    ).not.toBeInTheDocument();

    // Click the inputs editor's Add row → one row.
    const inputsContainer = screen.getByTestId("save-as-library-inputs");
    fireEvent.click(
      inputsContainer.querySelector(
        '[data-testid="save-as-library-inputs-add"]',
      ) as HTMLElement,
    );
    expect(
      screen.getByTestId("save-as-library-inputs-row-0"),
    ).toBeInTheDocument();

    // Click Add row again → two rows.
    fireEvent.click(
      inputsContainer.querySelector(
        '[data-testid="save-as-library-inputs-add"]',
      ) as HTMLElement,
    );
    expect(
      screen.getByTestId("save-as-library-inputs-row-1"),
    ).toBeInTheDocument();

    // Remove the first row.
    fireEvent.click(screen.getByTestId("save-as-library-inputs-row-0-remove"));
    // After removing row 0, only one row remains; it is now at index 0.
    expect(
      screen.getByTestId("save-as-library-inputs-row-0"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("save-as-library-inputs-row-1"),
    ).not.toBeInTheDocument();
  });
});

describe("SaveAsLibraryModal — Scenario 6 (US-060): Form validation blocks empty Name + empty rows on Save", () => {
  it("clicking Save with no Name surfaces an error and does NOT invoke onSubmit", () => {
    const { onSubmit } = renderModal({ initialName: "" });

    fireEvent.click(screen.getByTestId("save-as-library-submit"));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Name is required/)).toBeInTheDocument();
  });

  it("clicking Save with an inputs row that has a blank label surfaces a row error", () => {
    const { onSubmit } = renderModal();

    const inputsContainer = screen.getByTestId("save-as-library-inputs");
    fireEvent.click(
      inputsContainer.querySelector(
        '[data-testid="save-as-library-inputs-add"]',
      ) as HTMLElement,
    );
    // Row 0 exists but its label is empty. Submit.
    fireEvent.click(screen.getByTestId("save-as-library-submit"));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText(/All input rows need a non-empty label and path/),
    ).toBeInTheDocument();
  });
});

describe("SaveAsLibraryModal — Scenario 1 (US-061): Save POSTs a submission with the declared signature", () => {
  it("clicking Save with a valid form invokes onSubmit with the declared name, description, inputs, and outputs", () => {
    const { onSubmit } = renderModal({
      initialName: "My Library",
      initialDescription: "Test desc",
    });

    // Add one input row with valid fields.
    const inputsContainer = screen.getByTestId("save-as-library-inputs");
    fireEvent.click(
      inputsContainer.querySelector(
        '[data-testid="save-as-library-inputs-add"]',
      ) as HTMLElement,
    );
    fireEvent.change(screen.getByTestId("save-as-library-inputs-row-0-label"), {
      target: { value: "Doc URL" },
    });
    fireEvent.change(screen.getByTestId("save-as-library-inputs-row-0-path"), {
      target: { value: "ctx.documentUrl" },
    });

    // Add one output row with valid fields.
    const outputsContainer = screen.getByTestId("save-as-library-outputs");
    fireEvent.click(
      outputsContainer.querySelector(
        '[data-testid="save-as-library-outputs-add"]',
      ) as HTMLElement,
    );
    fireEvent.change(
      screen.getByTestId("save-as-library-outputs-row-0-label"),
      { target: { value: "Extracted" } },
    );
    fireEvent.change(screen.getByTestId("save-as-library-outputs-row-0-path"), {
      target: { value: "ctx.extracted" },
    });

    fireEvent.click(screen.getByTestId("save-as-library-submit"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "My Library",
        description: "Test desc",
        inputs: [{ label: "Doc URL", path: "ctx.documentUrl", type: "string" }],
        outputs: [
          { label: "Extracted", path: "ctx.extracted", type: "string" },
        ],
      }),
    );
  });
});

describe("SaveAsLibraryModal — US-099 Scenario 3: Kind selections flow through onSubmit", () => {
  it("setting an input row's Kind to 'Document' surfaces `kind: \"Document\"` in the submission payload", () => {
    const { onSubmit } = renderModal({ initialName: "Doc lib" });

    // Add one input row + fill required fields.
    const inputsContainer = screen.getByTestId("save-as-library-inputs");
    fireEvent.click(
      inputsContainer.querySelector(
        '[data-testid="save-as-library-inputs-add"]',
      ) as HTMLElement,
    );
    fireEvent.change(screen.getByTestId("save-as-library-inputs-row-0-label"), {
      target: { value: "Doc URL" },
    });
    fireEvent.change(screen.getByTestId("save-as-library-inputs-row-0-path"), {
      target: { value: "ctx.documentUrl" },
    });

    // Pick Document on the input row's Kind Select.
    fireEvent.click(screen.getByLabelText("Kind for Doc URL"));
    fireEvent.click(screen.getByRole("option", { name: "Document" }));

    fireEvent.click(screen.getByTestId("save-as-library-submit"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submission = onSubmit.mock.calls[0][0];
    expect(submission.inputs[0].kind).toBe("Document");
  });
});
