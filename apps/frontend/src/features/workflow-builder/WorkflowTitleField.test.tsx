/**
 * P-3 / R-2 — the workflow name as a click-to-edit title. What matters here is
 * the commit contract, because it is the only rename surface the editor has:
 * Enter and blur commit, Escape reverts, and an empty value is never a rename.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowTitleField } from "./WorkflowTitleField";

function renderField(value: string, onChange = vi.fn()) {
  render(
    <MantineProvider>
      <WorkflowTitleField value={value} onChange={onChange} />
    </MantineProvider>,
  );
  return onChange;
}

function openEditor() {
  fireEvent.click(screen.getByTestId("workflow-title"));
  return screen.getByLabelText("Name") as HTMLInputElement;
}

describe("WorkflowTitleField", () => {
  it("shows the name as a title, not a form field", () => {
    renderField("Invoice intake");
    expect(screen.getByTestId("workflow-title")).toHaveTextContent(
      "Invoice intake",
    );
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("clicking the title opens an input prefilled with the current name", () => {
    renderField("Invoice intake");
    expect(openEditor().value).toBe("Invoice intake");
  });

  it("Enter commits the trimmed value and closes the editor", () => {
    const onChange = renderField("Invoice intake");
    const input = openEditor();
    fireEvent.change(input, { target: { value: "  Mail room  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("Mail room");
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("blur commits too — clicking away is not a cancel", () => {
    const onChange = renderField("Invoice intake");
    const input = openEditor();
    fireEvent.change(input, { target: { value: "Mail room" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("Mail room");
  });

  it("Escape reverts without renaming", () => {
    const onChange = renderField("Invoice intake");
    const input = openEditor();
    fireEvent.change(input, { target: { value: "Mail room" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("workflow-title")).toHaveTextContent(
      "Invoice intake",
    );
  });

  it("an empty value is not a rename — the title is the only thing to click back into", () => {
    const onChange = renderField("Invoice intake");
    const input = openEditor();
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("workflow-title")).toHaveTextContent(
      "Invoice intake",
    );
  });

  it("committing an unchanged name does not fire a rename", () => {
    const onChange = renderField("Invoice intake");
    fireEvent.keyDown(openEditor(), { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
