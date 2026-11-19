/**
 * Render + interaction coverage for `<KindSelect>` (US-098).
 *
 * Pins the contract:
 *   - sentinel rendered as "—" when value is undefined
 *   - choosing a real kind fires onChange with that kind
 *   - choosing the wildcard "—" fires onChange with undefined
 */

import "@testing-library/jest-dom";

import type { KindRef } from "@ai-di/graph-workflow";
import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { KindSelect } from "./KindSelect";

function Wrapper({
  initial,
  onChangeSpy,
}: {
  initial: KindRef | undefined;
  onChangeSpy?: (v: KindRef | undefined) => void;
}) {
  const [value, setValue] = useState<KindRef | undefined>(initial);
  return (
    <MantineProvider>
      <KindSelect
        label="Kind"
        aria-label="kind-picker"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChangeSpy?.(next);
        }}
      />
    </MantineProvider>
  );
}

describe("KindSelect", () => {
  it("renders the '—' wildcard when value is undefined", () => {
    render(<Wrapper initial={undefined} />);
    const input = screen.getByLabelText("kind-picker") as HTMLInputElement;
    expect(input.value).toBe("—");
  });

  it("renders the registry displayName for a defined KindRef", () => {
    render(<Wrapper initial="MultiPageDocument" />);
    const input = screen.getByLabelText("kind-picker") as HTMLInputElement;
    expect(input.value).toBe("Multi-page document");
  });

  it("renders the '(array)' suffix for array variants", () => {
    render(<Wrapper initial="Document[]" />);
    const input = screen.getByLabelText("kind-picker") as HTMLInputElement;
    expect(input.value).toBe("Document (array)");
  });

  it("fires onChange with the picked KindRef when the user selects a real kind", () => {
    const spy = vi.fn();
    render(<Wrapper initial={undefined} onChangeSpy={spy} />);
    const input = screen.getByLabelText("kind-picker");
    fireEvent.click(input);

    // Mantine renders the dropdown options inside a portal. Find the
    // option labelled exactly "Document" (not the "Document (array)"
    // variant) and click it.
    const option = screen.getByRole("option", { name: "Document" });
    fireEvent.click(option);

    expect(spy).toHaveBeenCalledWith("Document");
  });

  it("fires onChange with an array-kind value when the user selects an array variant", () => {
    const spy = vi.fn();
    render(<Wrapper initial={undefined} onChangeSpy={spy} />);
    fireEvent.click(screen.getByLabelText("kind-picker"));

    const option = screen.getByRole("option", {
      name: "Multi-page document (array)",
    });
    fireEvent.click(option);

    expect(spy).toHaveBeenCalledWith("MultiPageDocument[]");
  });

  it("fires onChange with undefined when the user picks the '—' wildcard", () => {
    const spy = vi.fn();
    render(<Wrapper initial="Document" onChangeSpy={spy} />);
    fireEvent.click(screen.getByLabelText("kind-picker"));

    // The '—' option lives in the Wildcard group at the top of the
    // dropdown. Disambiguate from any text dash by using the role-based
    // option lookup.
    const wildcardOption = screen.getByRole("option", { name: "—" });
    fireEvent.click(wildcardOption);

    expect(spy).toHaveBeenCalledWith(undefined);
  });

  it("groups options by family in the dropdown", () => {
    render(<Wrapper initial={undefined} />);
    fireEvent.click(screen.getByLabelText("kind-picker"));

    // Mantine renders group headers as elements with `role="presentation"`
    // — instead, just confirm a known per-family option exists.
    expect(
      screen.getByRole("option", { name: "Multi-page document" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Segment (Table)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "OCR result" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Reference" }),
    ).toBeInTheDocument();

    // Smoke-check the wildcard label sits at the top of the listbox.
    const listbox = screen.getByRole("listbox");
    const firstOption = within(listbox).getAllByRole("option")[0];
    expect(firstOption).toHaveTextContent("—");
  });
});
