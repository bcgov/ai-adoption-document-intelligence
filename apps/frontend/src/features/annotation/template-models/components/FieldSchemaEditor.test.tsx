import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@bcgov/design-system-react-components", () =>
  import("../../../../test/mockBcdsComponents").then((mod) =>
    mod.mockBcdsDesignSystem(),
  ),
);

import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "../../../../ui";
import { FieldType } from "../../core/types/field";
import { FieldSchemaEditor } from "./FieldSchemaEditor";

describe("FieldSchemaEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits the trimmed description with a new field", () => {
    const onSubmit = vi.fn();
    render(
      <MantineProvider>
        <FieldSchemaEditor opened onClose={vi.fn()} onSubmit={onSubmit} />
      </MantineProvider>,
    );

    fireEvent.change(screen.getByLabelText("Field key"), {
      target: { value: "filing_date" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "  Date at the bottom of the form  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save field" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        field_key: "filing_date",
        description: "Date at the bottom of the form",
      }),
    );
  });

  it("prefills the description when editing a field", () => {
    render(
      <MantineProvider>
        <FieldSchemaEditor
          opened
          onClose={vi.fn()}
          onSubmit={vi.fn()}
          initialValue={{
            id: "f1",
            fieldKey: "filing_date",
            fieldType: FieldType.DATE,
            displayOrder: 0,
            description: "Date at the bottom of the form",
          }}
        />
      </MantineProvider>,
    );

    expect(screen.getByLabelText("Description")).toHaveValue(
      "Date at the bottom of the form",
    );
  });
});
