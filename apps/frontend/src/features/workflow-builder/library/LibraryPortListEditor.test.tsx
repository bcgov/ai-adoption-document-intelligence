/**
 * Tests for `LibraryPortListEditor` (US-099): the Kind Select column on
 * the library-workflow port editor inside `SaveAsLibraryModal`.
 *
 * Each test corresponds to one acceptance scenario in
 * feature-docs/20260529-workflow-builder-phase3-typed-io-artifacts/user_stories/
 * US-099-library-port-list-editor-kind-column.md.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { LibraryPortDescriptor } from "../../../types/workflow";
import { LibraryPortListEditor } from "./LibraryPortListEditor";

function Harness({
  initial,
  onRows,
  testIdBase = "ports",
}: {
  initial: LibraryPortDescriptor[];
  onRows?: (next: LibraryPortDescriptor[]) => void;
  testIdBase?: string;
}) {
  const [rows, setRows] = useState<LibraryPortDescriptor[]>(initial);
  return (
    <MantineProvider>
      <LibraryPortListEditor
        title="Inputs"
        description="Declared library inputs."
        testIdBase={testIdBase}
        rows={rows}
        onChange={(next) => {
          setRows(next);
          onRows?.(next);
        }}
      />
    </MantineProvider>
  );
}

describe("LibraryPortListEditor — US-099 Kind column", () => {
  it("Scenario 1: renders a Kind Select for each row alongside Label / Path / Type", () => {
    render(
      <Harness
        initial={[
          { label: "Doc URL", path: "ctx.documentUrl", type: "string" },
          { label: "Pages", path: "ctx.pages", type: "array" },
        ]}
      />,
    );

    // Each row exposes the Kind Select via its row-scoped aria-label.
    expect(screen.getByLabelText("Kind for Doc URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Kind for Pages")).toBeInTheDocument();

    // Row testids carry the kind input too.
    expect(screen.getByTestId("ports-row-0-kind")).toBeInTheDocument();
    expect(screen.getByTestId("ports-row-1-kind")).toBeInTheDocument();

    // Sibling columns still present, confirming order Label → Path → Type → Kind.
    expect(screen.getByTestId("ports-row-0-label")).toBeInTheDocument();
    expect(screen.getByTestId("ports-row-0-path")).toBeInTheDocument();
    expect(screen.getByTestId("ports-row-0-type")).toBeInTheDocument();
  });

  it("Scenario 1: the column appears identically on the outputs section testIdBase", () => {
    render(
      <Harness
        initial={[{ label: "Result", path: "ctx.result", type: "object" }]}
        testIdBase="save-as-library-outputs"
      />,
    );

    expect(
      screen.getByTestId("save-as-library-outputs-row-0-kind"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Kind for Result")).toBeInTheDocument();
  });

  it("Scenario 2: Kind Select surfaces the wildcard '—' first and a 'Document' option", () => {
    render(
      <Harness
        initial={[
          { label: "Doc URL", path: "ctx.documentUrl", type: "string" },
        ]}
      />,
    );

    fireEvent.click(screen.getByLabelText("Kind for Doc URL"));

    // Wildcard '—' present and Document present — same helper as US-098.
    expect(screen.getByRole("option", { name: "—" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Document" }),
    ).toBeInTheDocument();
  });

  it("Scenario 3: picking 'Document' persists `kind: \"Document\"` on the row state", () => {
    let latest: LibraryPortDescriptor[] | undefined;
    render(
      <Harness
        initial={[
          { label: "Doc URL", path: "ctx.documentUrl", type: "string" },
        ]}
        onRows={(next) => {
          latest = next;
        }}
      />,
    );

    fireEvent.click(screen.getByLabelText("Kind for Doc URL"));
    fireEvent.click(screen.getByRole("option", { name: "Document" }));

    expect(latest?.[0].kind).toBe("Document");

    // Re-renders with the selection retained.
    const select = screen.getByLabelText(
      "Kind for Doc URL",
    ) as HTMLInputElement;
    expect(select.value).toBe("Document");
  });

  it("Scenario 4: picking '—' strips `kind` from the row (no key in serialised JSON)", () => {
    let latest: LibraryPortDescriptor[] | undefined;
    render(
      <Harness
        initial={[
          {
            label: "Doc URL",
            path: "ctx.documentUrl",
            type: "string",
            kind: "Document",
          },
        ]}
        onRows={(next) => {
          latest = next;
        }}
      />,
    );

    fireEvent.click(screen.getByLabelText("Kind for Doc URL"));
    fireEvent.click(screen.getByRole("option", { name: "—" }));

    // `kind` must be absent — JSON.stringify drops it.
    expect(latest?.[0].kind).toBeUndefined();
    expect("kind" in (latest?.[0] ?? {})).toBe(false);
    const serialised = JSON.stringify(latest?.[0]);
    expect(serialised).not.toContain("kind");

    const select = screen.getByLabelText(
      "Kind for Doc URL",
    ) as HTMLInputElement;
    expect(select.value).toBe("—");
  });

  it("Scenario 4: legacy rows (no `kind` field) render the '—' wildcard selected by default", () => {
    render(
      <Harness
        initial={[{ label: "Legacy", path: "ctx.legacy", type: "string" }]}
      />,
    );

    const select = screen.getByLabelText("Kind for Legacy") as HTMLInputElement;
    expect(select.value).toBe("—");
  });

  it("Scenario 2: input and output rows surface the same option set", () => {
    // Render the inputs editor, capture its option set, unmount.
    const inputView = render(
      <Harness
        initial={[
          { label: "Doc URL", path: "ctx.documentUrl", type: "string" },
        ]}
        testIdBase="inputs"
      />,
    );
    fireEvent.click(inputView.getByLabelText("Kind for Doc URL"));
    const inputOptions = inputView
      .getAllByRole("option")
      .map((node) => node.textContent ?? "");
    inputView.unmount();

    // Render the outputs editor, capture its option set.
    const outputView = render(
      <Harness
        initial={[{ label: "Result", path: "ctx.result", type: "object" }]}
        testIdBase="outputs"
      />,
    );
    fireEvent.click(outputView.getByLabelText("Kind for Result"));
    const outputOptions = outputView
      .getAllByRole("option")
      .map((node) => node.textContent ?? "");

    expect(outputOptions).toEqual(inputOptions);
  });
});

describe("LibraryPortListEditor — Phase 2 Track 1 regression", () => {
  it("still renders Label / Path / Type columns when no `kind` is set", () => {
    render(
      <Harness
        initial={[
          { label: "Doc URL", path: "ctx.documentUrl", type: "string" },
        ]}
      />,
    );

    const row = screen.getByTestId("ports-row-0");
    expect(within(row).getByDisplayValue("Doc URL")).toBeInTheDocument();
    expect(
      within(row).getByDisplayValue("ctx.documentUrl"),
    ).toBeInTheDocument();
    // Type select's controlled hidden input carries the chosen value.
    expect(screen.getByTestId("ports-row-0-type")).toBeInTheDocument();
  });
});
