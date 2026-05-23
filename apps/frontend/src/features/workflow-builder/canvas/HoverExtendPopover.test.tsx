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
  };
  const utils = render(
    <MantineProvider>
      <HoverExtendPopover {...props} />
    </MantineProvider>,
  );
  return { ...utils, props };
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
