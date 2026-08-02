/**
 * Tests for `HoverExtendPopover` (US-045).
 *
 * Each test maps to one acceptance scenario from
 * feature-docs/20260525-workflow-builder-phase1b-completion/user_stories/US-045-hover-to-extend.md.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HoverExtendPopover } from "./HoverExtendPopover";

function renderPopover(
  overrides: Partial<React.ComponentProps<typeof HoverExtendPopover>> = {},
) {
  const props: React.ComponentProps<typeof HoverExtendPopover> = {
    opened: overrides.opened ?? true,
    anchorPosition: overrides.anchorPosition ?? { x: 100, y: 100 },
    onClose: overrides.onClose ?? vi.fn(),
    onPickActivity: overrides.onPickActivity ?? vi.fn(),
    onPickControlFlow: overrides.onPickControlFlow ?? vi.fn(),
    filterKind: overrides.filterKind,
    direction: overrides.direction,
    gestureKey: overrides.gestureKey,
  };
  const utils = render(
    <MantineProvider>
      <HoverExtendPopover {...props} />
    </MantineProvider>,
  );
  const rerender = (
    next: Partial<React.ComponentProps<typeof HoverExtendPopover>>,
  ) =>
    utils.rerender(
      <MantineProvider>
        <HoverExtendPopover {...props} {...next} />
      </MantineProvider>,
    );
  return { ...utils, props, rerender };
}

describe("HoverExtendPopover", () => {
  it("renders the categorised list when opened", () => {
    renderPopover();
    expect(screen.getByTestId("hover-extend-popover")).toBeInTheDocument();
    // Flow Control section header.
    expect(screen.getByText("Flow Control")).toBeInTheDocument();
    // All six control-flow shortcuts.
    expect(
      screen.getByTestId("hover-extend-control-flow-switch"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("hover-extend-control-flow-map"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("hover-extend-control-flow-join"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("hover-extend-control-flow-childWorkflow"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("hover-extend-control-flow-pollUntil"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("hover-extend-control-flow-humanGate"),
    ).toBeInTheDocument();
    // At least one activity row (use a known catalog entry).
    expect(
      screen.getByTestId("hover-extend-activity-data.transform"),
    ).toBeInTheDocument();
  });

  it("does not render its content when opened=false", () => {
    renderPopover({ opened: false });
    expect(
      screen.queryByTestId("hover-extend-popover"),
    ).not.toBeInTheDocument();
  });

  it("narrows the visible entries when the user types a search query", () => {
    renderPopover();
    // Initially both a switch shortcut + a data.transform activity exist.
    expect(
      screen.getByTestId("hover-extend-control-flow-switch"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("hover-extend-activity-data.transform"),
    ).toBeInTheDocument();

    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: "data.transform" } });

    // The data.transform activity row remains visible.
    expect(
      screen.getByTestId("hover-extend-activity-data.transform"),
    ).toBeInTheDocument();
    // The switch control-flow row is filtered out — it doesn't match the
    // query.
    expect(
      screen.queryByTestId("hover-extend-control-flow-switch"),
    ).not.toBeInTheDocument();
  });

  it("fires onPickActivity when an activity row is clicked", () => {
    const onPickActivity = vi.fn();
    renderPopover({ onPickActivity });
    fireEvent.click(screen.getByTestId("hover-extend-activity-data.transform"));
    expect(onPickActivity).toHaveBeenCalledTimes(1);
    expect(onPickActivity).toHaveBeenCalledWith("data.transform");
  });

  it("fires onPickControlFlow when a control-flow row is clicked", () => {
    const onPickControlFlow = vi.fn();
    renderPopover({ onPickControlFlow });
    fireEvent.click(screen.getByTestId("hover-extend-control-flow-switch"));
    expect(onPickControlFlow).toHaveBeenCalledTimes(1);
    expect(onPickControlFlow).toHaveBeenCalledWith("switch");
  });
});

describe("HoverExtendPopover — kind-aware filtering (§9)", () => {
  it("with filterKind set, shows only activities accepting that kind, plus Flow Control", () => {
    renderPopover({ filterKind: "PreparedFile" });
    // azureOcr.submit.fileData: PreparedFile accepts a PreparedFile producer.
    expect(
      screen.getByTestId("hover-extend-activity-azureOcr.submit"),
    ).toBeInTheDocument();
    // document.split.blobKey is MultiPageDocument — a PreparedFile is NOT
    // assignable to it, so it is filtered out.
    expect(
      screen.queryByTestId("hover-extend-activity-document.split"),
    ).not.toBeInTheDocument();
    // Flow Control always renders.
    expect(
      screen.getByTestId("hover-extend-control-flow-switch"),
    ).toBeInTheDocument();
  });

  it("ranks exact-kind matches first when filterKind is set", () => {
    renderPopover({ filterKind: "MultiPageDocument" });
    // Within "Document Handling": document.split (exact MultiPageDocument)
    // must render before document.normalizeOrientation (Document — merely
    // assignable), reversing their displayName order ("Correct Orientation"
    // < "Split Document").
    const split = screen.getByTestId("hover-extend-activity-document.split");
    const normalize = screen.getByTestId(
      "hover-extend-activity-document.normalizeOrientation",
    );
    expect(
      split.compareDocumentPosition(normalize) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("'Show all' (testid hover-extend-show-all) reveals the full catalog", () => {
    renderPopover({ filterKind: "PreparedFile" });
    // Hidden while filtered.
    expect(
      screen.queryByTestId("hover-extend-activity-document.split"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("hover-extend-show-all"));
    // Now the full catalog (including non-accepting activities) shows.
    expect(
      screen.getByTestId("hover-extend-activity-document.split"),
    ).toBeInTheDocument();
  });

  it("without filterKind, renders exactly as before (regression)", () => {
    renderPopover();
    // Full catalog + no Show-all affordance.
    expect(
      screen.getByTestId("hover-extend-activity-data.transform"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("hover-extend-activity-document.split"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("hover-extend-show-all"),
    ).not.toBeInTheDocument();
  });

  it("resets 'Show all' per gesture, so sliding to another same-kind port re-filters", () => {
    const { rerender } = renderPopover({
      filterKind: "PreparedFile",
      gestureKey: "prep:preparedData",
    });
    // Expand to the full list on the first port.
    fireEvent.click(screen.getByTestId("hover-extend-show-all"));
    expect(
      screen.getByTestId("hover-extend-activity-document.split"),
    ).toBeInTheDocument();
    // Slide to a DIFFERENT output port of the SAME kind: filterKind is
    // unchanged, but the gesture identity changes → the view re-filters.
    rerender({ filterKind: "PreparedFile", gestureKey: "prep:otherDocPort" });
    expect(
      screen.queryByTestId("hover-extend-activity-document.split"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("hover-extend-show-all")).toBeInTheDocument();
  });

  it("when zero activities accept the kind, falls back to the full list (no dead end)", () => {
    // ValidationResult is a registered kind that no auto-wireable input
    // consumes → zero matches → fall back to the unfiltered list.
    renderPopover({ filterKind: "ValidationResult" });
    expect(
      screen.getByTestId("hover-extend-activity-document.split"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("hover-extend-control-flow-switch"),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Inderdeep walkthrough 2026-07-29 — upstream direction: filter to activities
// that PRODUCE the kind, and never offer Flow Control (a control-flow node
// produces no data to feed the hovered input).
// ---------------------------------------------------------------------------

describe("HoverExtendPopover — upstream direction", () => {
  it("shows producers of the kind and hides accept-only activities", () => {
    renderPopover({ filterKind: "PreparedFile", direction: "upstream" });
    // file.prepare outputs preparedData: PreparedFile → offered.
    expect(
      screen.getByTestId("hover-extend-activity-file.prepare"),
    ).toBeInTheDocument();
    // azureOcr.submit ACCEPTS PreparedFile but produces none → hidden.
    expect(
      screen.queryByTestId("hover-extend-activity-azureOcr.submit"),
    ).not.toBeInTheDocument();
  });

  it("hides the Flow Control section entirely", () => {
    renderPopover({ filterKind: "PreparedFile", direction: "upstream" });
    expect(
      screen.queryByTestId("hover-extend-control-flow-switch"),
    ).not.toBeInTheDocument();
  });

  it("downstream direction (default) keeps Flow Control (regression)", () => {
    renderPopover({ filterKind: "PreparedFile" });
    expect(
      screen.getByTestId("hover-extend-control-flow-switch"),
    ).toBeInTheDocument();
  });
});
