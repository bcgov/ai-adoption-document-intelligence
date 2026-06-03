vi.mock("@bcgov/design-system-react-components", () =>
  import("../test/mockBcdsComponents").then((mod) =>
    mod.mockBcdsDesignSystem(),
  ),
);

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBcdsMocks } from "../test/mockBcdsComponents";
import { DateInput } from "./DateInput";

describe("DateInput adapter", () => {
  beforeEach(() => {
    getBcdsMocks().mockBcdsDatePicker.mockClear();
  });

  it("converts Date values to calendar strings", () => {
    render(
      <DateInput
        label="Due date"
        value={new Date("2026-06-03T12:00:00Z")}
        onChange={() => undefined}
      />,
    );

    expect(getBcdsMocks().mockBcdsDatePicker).toHaveBeenCalledWith(
      expect.objectContaining({
        value: expect.objectContaining({
          toString: expect.any(Function),
        }),
      }),
    );
  });

  it("calls onChange with a Date when calendar value changes", () => {
    const onChange = vi.fn();
    render(<DateInput label="Due date" value={null} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("bcds-date-picker"), {
      target: { value: "2026-06-03" },
    });
    expect(onChange).toHaveBeenCalledWith(expect.any(Date));
  });
});
