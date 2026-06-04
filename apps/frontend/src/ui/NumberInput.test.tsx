vi.mock("@bcgov/design-system-react-components", () =>
  import("../test/mockBcdsComponents").then((mod) =>
    mod.mockBcdsDesignSystem(),
  ),
);

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBcdsMocks } from "../test/mockBcdsComponents";
import { NumberInput } from "./NumberInput";

describe("NumberInput adapter", () => {
  beforeEach(() => {
    getBcdsMocks().mockBcdsNumberField.mockClear();
  });

  it("passes numeric value to BC DS NumberField", () => {
    render(<NumberInput label="Count" value={3} onChange={() => undefined} />);
    expect(getBcdsMocks().mockBcdsNumberField).toHaveBeenCalledWith(
      expect.objectContaining({ value: 3, label: "Count" }),
    );
  });

  it("calls onChange with parsed numbers", () => {
    const onChange = vi.fn();
    render(<NumberInput value={1} onChange={onChange} label="Count" />);
    fireEvent.change(screen.getByTestId("bcds-number-field"), {
      target: { value: "5" },
    });
    expect(onChange).toHaveBeenCalledWith(5);
  });
});
