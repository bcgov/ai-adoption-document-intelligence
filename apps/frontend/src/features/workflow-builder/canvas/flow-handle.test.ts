/**
 * The run-order handles are ONE dot drawn one way (review item D28).
 *
 * These tests pin the three things the reviewer read as meaningful and that
 * were not: the vertical anchor, the fill, and the fact that the fill is the
 * wire's own grey rather than a second grey picked separately.
 */

import { describe, expect, it } from "vitest";
import { portDotColor } from "./artifact-kind-colour";
import {
  FLOW_HANDLE_COLOR,
  FLOW_HANDLE_TOOLTIP_IN,
  FLOW_HANDLE_TOOLTIP_OUT,
  FLOW_HANDLE_TOP,
  flowHandleStyle,
} from "./flow-handle";
import { SEQUENCE_STROKE } from "./WorkflowEdge";

describe("flowHandleStyle — one geometry for every rectangular card", () => {
  it("pins the pair at the same pixel offset from the card top", () => {
    expect(flowHandleStyle("card-top").top).toBe(FLOW_HANDLE_TOP);
  });

  it("centres the pair on the switch diamond's left/right vertices", () => {
    // The one surviving position difference, and geometry forces it: a
    // rotated square has no top-left corner to pin 18px below.
    expect(flowHandleStyle("middle").top).toBe("50%");
  });

  it("paints both anchors the same fill — only the height differs", () => {
    expect(flowHandleStyle("card-top").background).toBe(
      flowHandleStyle("middle").background,
    );
  });
});

describe("the run-order dot's fill", () => {
  it("is the dashed 'Runs after' wire's own grey, shared not restated", () => {
    expect(FLOW_HANDLE_COLOR).toBe(SEQUENCE_STROKE);
    expect(flowHandleStyle("card-top").background).toBe(SEQUENCE_STROKE);
  });

  it("is NOT the wildcard DATA port grey, which is what it used to be", () => {
    // `portDotColor("gray")` is the untyped/`Artifact` port colour. Painting
    // the run-order dot in it made an execution connector look like a data
    // port on every activity card.
    expect(FLOW_HANDLE_COLOR).not.toBe(portDotColor("gray"));
  });
});

describe("the run-order dot says what it is and that it can be dragged", () => {
  it("names the concept in the legend's words on both sides", () => {
    expect(FLOW_HANDLE_TOOLTIP_IN).toContain("Runs after");
    expect(FLOW_HANDLE_TOOLTIP_OUT).toContain("Runs after");
    expect(FLOW_HANDLE_TOOLTIP_IN).toContain("Order only, no data");
    expect(FLOW_HANDLE_TOOLTIP_OUT).toContain("Order only, no data");
  });

  it("answers D10 out loud — the gesture exists, here is what it does", () => {
    expect(FLOW_HANDLE_TOOLTIP_OUT).toContain("drag");
    expect(FLOW_HANDLE_TOOLTIP_IN).toContain("drop");
  });
});
