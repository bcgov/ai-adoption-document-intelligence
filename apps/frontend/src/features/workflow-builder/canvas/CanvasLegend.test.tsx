/**
 * Tests for CanvasLegend (Inderdeep walkthrough 2026-07-29) — the in-place
 * explanation of the port/wire colour scheme.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CanvasLegend } from "./CanvasLegend";

const renderLegend = () =>
  render(
    <MantineProvider>
      <CanvasLegend />
    </MantineProvider>,
  );

describe("CanvasLegend", () => {
  it("is closed until the Legend button is clicked", () => {
    renderLegend();
    expect(screen.queryByTestId("canvas-legend")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("canvas-legend-button"));
    expect(screen.getByTestId("canvas-legend")).toBeInTheDocument();
  });

  it("explains the wire variants and the data families", () => {
    renderLegend();
    fireEvent.click(screen.getByTestId("canvas-legend-button"));
    // Wire semantics.
    expect(
      screen.getByText(/runs after — order only, no data/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/data flows — colour = data family/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/error route/i)).toBeInTheDocument();
    // One row per registry family + the untyped wildcard.
    const families = screen.getByTestId("canvas-legend-families");
    expect(families).toHaveTextContent("Documents & files");
    expect(families).toHaveTextContent("Segments");
    expect(families).toHaveTextContent("OCR results");
    expect(families).toHaveTextContent("Classification & validation");
    expect(families).toHaveTextContent("References");
    expect(families).toHaveTextContent("Identifiers");
    expect(families).toHaveTextContent("Untyped (anything)");
    // The two handle modifiers.
    expect(families).toHaveTextContent("Double ring — a list of items");
    expect(families).toHaveTextContent(
      "Amber ring — input still needs a source",
    );
  });
});
