import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@bcgov/design-system-react-components", () =>
  import("../test/mockBcdsComponents").then((mod) =>
    mod.mockBcdsDesignSystem(),
  ),
);

import { fireEvent, render, screen } from "@testing-library/react";
import { getBcdsMocks } from "../test/mockBcdsComponents";
import { Switch } from "./Switch";

describe("Switch adapter", () => {
  beforeEach(() => {
    getBcdsMocks().mockBcdsSwitch.mockClear();
  });

  it("renders label children", () => {
    render(<Switch label="Enabled" checked onChange={() => undefined} />);
    expect(screen.getByText("Enabled")).toBeInTheDocument();
  });

  it("emits Mantine-style change events", () => {
    const onChange = vi.fn();
    render(<Switch label="Enabled" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange.mock.calls[0]?.[0].currentTarget.checked).toBe(true);
  });
});
