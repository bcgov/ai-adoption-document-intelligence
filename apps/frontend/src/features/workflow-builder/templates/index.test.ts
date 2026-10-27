import { describe, expect, it } from "vitest";
import { WORKFLOW_TEMPLATES } from "./index";

describe("WORKFLOW_TEMPLATES", () => {
  it("bundles the shipped templates", () => {
    // A glob that matches nothing returns {} without an error, so a wrong
    // pattern or alias would build fine and leave the picker empty.
    expect(WORKFLOW_TEMPLATES.map((t) => t.id)).toContain(
      "standard-ocr-workflow",
    );
  });
});
