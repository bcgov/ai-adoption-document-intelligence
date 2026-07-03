import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@bcgov/design-system-react-components", () =>
  import("../test/mockBcdsComponents").then((mod) =>
    mod.mockBcdsDesignSystem(),
  ),
);

import { fireEvent, render, screen } from "@testing-library/react";
import { getBcdsMocks } from "../test/mockBcdsComponents";

vi.mock("@mantine/core", () => ({
  Select: vi.fn(
    ({
      data,
      value,
      onChange,
    }: {
      data?: { value: string; label: string }[];
      value?: string | null;
      onChange?: (value: string | null) => void;
    }) => (
      <select
        data-testid="mantine-select"
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value || null)}
      >
        {data?.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    ),
  ),
}));

import {
  BCDS_EMPTY_SELECT_KEY,
  fromBcdsItemId,
  Select,
  toBcdsItemId,
} from "./Select";

describe("Select empty-string helpers", () => {
  it("maps empty string to sentinel and back", () => {
    expect(toBcdsItemId("")).toBe(BCDS_EMPTY_SELECT_KEY);
    expect(fromBcdsItemId(BCDS_EMPTY_SELECT_KEY)).toBe("");
    expect(toBcdsItemId("pending")).toBe("pending");
    expect(fromBcdsItemId("pending")).toBe("pending");
  });
});

describe("Select adapter", () => {
  beforeEach(() => {
    getBcdsMocks().mockBcdsSelect.mockClear();
  });

  it("maps empty-string option values for BC DS Select", () => {
    render(
      <Select
        label="Canonicalize"
        data={[{ value: "", label: "None" }]}
        value=""
        onChange={() => undefined}
      />,
    );

    expect(getBcdsMocks().mockBcdsSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedKey: BCDS_EMPTY_SELECT_KEY,
        items: [{ id: BCDS_EMPTY_SELECT_KEY, label: "None" }],
      }),
    );
  });

  it("maps sentinel selection back to empty string", () => {
    const onChange = vi.fn();
    render(
      <Select
        data={[{ value: "", label: "None" }]}
        value=""
        onChange={onChange}
        placeholder="Choose"
      />,
    );

    fireEvent.click(
      screen.getByTestId(`select-option-${BCDS_EMPTY_SELECT_KEY}`),
    );
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("uses Mantine fallback when clearable", () => {
    render(
      <Select
        clearable
        data={[{ value: "", label: "All" }]}
        value=""
        onChange={() => undefined}
      />,
    );

    expect(screen.getByTestId("mantine-select")).toBeInTheDocument();
    expect(getBcdsMocks().mockBcdsSelect).not.toHaveBeenCalled();
  });

  it("derives aria-label from placeholder when unlabeled", () => {
    render(
      <Select
        placeholder="Filter by type"
        data={[{ value: "a", label: "A" }]}
        value="a"
        onChange={() => undefined}
      />,
    );

    expect(getBcdsMocks().mockBcdsSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        "aria-label": "Filter by type",
      }),
    );
  });

  it("applies fit-content wrapper class by default", () => {
    const { container } = render(
      <Select
        data={[{ value: "a", label: "A" }]}
        value="a"
        onChange={() => undefined}
      />,
    );

    expect(
      container.querySelector(".bcds-form-field--fit"),
    ).toBeInTheDocument();
  });
});
