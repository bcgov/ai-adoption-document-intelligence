import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@bcgov/design-system-react-components", () =>
  import("../test/mockBcdsComponents").then((mod) =>
    mod.mockBcdsDesignSystem(),
  ),
);

import { render } from "@testing-library/react";
import { getBcdsMocks } from "../test/mockBcdsComponents";
import { Textarea } from "./Textarea";

describe("Textarea adapter", () => {
  beforeEach(() => {
    getBcdsMocks().mockBcdsTextArea.mockClear();
  });

  it("does not set aria-label when a visible label is present", () => {
    render(
      <Textarea
        label="Reason"
        placeholder="Optional"
        value=""
        onChange={() => undefined}
      />,
    );
    expect(getBcdsMocks().mockBcdsTextArea).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Reason",
        "aria-label": undefined,
      }),
    );
  });

  it("derives aria-label from placeholder when unlabeled", () => {
    render(
      <Textarea placeholder="Notes" value="" onChange={() => undefined} />,
    );
    expect(getBcdsMocks().mockBcdsTextArea).toHaveBeenCalledWith(
      expect.objectContaining({ "aria-label": "Notes" }),
    );
  });

  it("applies minRows height style", () => {
    render(<Textarea minRows={4} value="" onChange={() => undefined} />);
    expect(getBcdsMocks().mockBcdsTextArea).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ minHeight: "6rem" }),
      }),
    );
  });
});
