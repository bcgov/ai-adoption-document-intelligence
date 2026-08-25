/**
 * Tests for CanvasLegend (UX walkthrough 2026-07-29) — the in-place
 * explanation of the port/wire colour scheme.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PORT_FAMILIES } from "./artifact-kind-colour";
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

    // One row per port FAMILY — five of them since item 20 (2026-08-09), not
    // the thirteen Inderdeep counted. The rows are read from `PORT_FAMILIES`
    // rather than restated here on purpose: a legend that hardcodes its own
    // wording is a legend that can disagree with the canvas it explains.
    const families = screen.getByTestId("canvas-legend-families");
    expect(PORT_FAMILIES).toHaveLength(5);
    const swatches = families.querySelectorAll("[data-legend-swatch]");
    expect(swatches).toHaveLength(PORT_FAMILIES.length);
    for (const family of PORT_FAMILIES) {
      // Both signals per row: what the family MEANS, and the non-chromatic
      // silhouette that says it a second way for anyone who cannot separate
      // two of the hues.
      expect(families).toHaveTextContent(family.label);
      expect(families).toHaveTextContent(family.shapeLabel);
      const swatch = families.querySelector(
        `[data-legend-swatch='${family.token}']`,
      );
      expect(swatch).not.toBeNull();
      expect(swatch?.getAttribute("data-legend-shape")).toBe(family.shape);
    }
    // The two merges item 20 made, asserted as absences: `Segment*` folded
    // into violet with `Ocr*`, and `Identifier*` folded into teal with
    // `Reference` — so neither `green` nor `cyan` is a family any more, and
    // the legend must not teach a colour the canvas no longer paints.
    expect(families.querySelector("[data-legend-swatch='green']")).toBeNull();
    expect(families.querySelector("[data-legend-swatch='cyan']")).toBeNull();

    // "Data flows — colour = data family" is drawn as a run of every family
    // colour. It used to be a single blue, which was ALSO the Documents
    // colour, so the sample for "any data" looked like the sample for "a
    // document" — one segment per family is the row saying its own sentence.
    const dataWire = screen.getByTestId("canvas-legend-data-wire-sample");
    expect(dataWire.querySelectorAll("line")).toHaveLength(
      PORT_FAMILIES.length,
    );

    // The two handle modifiers now live in their own "Rings" group rather
    // than among the family rows — they are things that happen TO a dot, on
    // top of whatever family it belongs to, so they are not a sixth family.
    const rings = screen.getByTestId("canvas-legend-rings");
    expect(rings).toHaveTextContent("Double ring — a list of items");
    expect(rings).toHaveTextContent("Amber ring — input still needs a source");
    // …and they are NOT counted as families, which is the whole point of the
    // split: the vocabulary the user has to learn is five, not seven.
    expect(families).not.toHaveTextContent("Double ring");
    expect(families).not.toHaveTextContent("Amber ring");
  });
});
