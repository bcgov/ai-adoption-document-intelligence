vi.mock("@bcgov/design-system-react-components", () =>
  import("../test/mockBcdsComponents").then((mod) =>
    mod.mockBcdsDesignSystem(),
  ),
);

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBcdsMocks } from "../test/mockBcdsComponents";
import { Checkbox } from "./Checkbox";

describe("Checkbox adapter", () => {
  beforeEach(() => {
    getBcdsMocks().mockBcdsCheckbox.mockClear();
  });

  it("maps checked to isSelected", () => {
    render(<Checkbox label="Accept" checked onChange={() => undefined} />);
    expect(getBcdsMocks().mockBcdsCheckbox).toHaveBeenCalledWith(
      expect.objectContaining({ isSelected: true }),
    );
  });

  it("emits Mantine-style change events", () => {
    const onChange = vi.fn();
    render(<Checkbox label="Accept" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange.mock.calls[0]?.[0].currentTarget.checked).toBe(true);
  });
});
