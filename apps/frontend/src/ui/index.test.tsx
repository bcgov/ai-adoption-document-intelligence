vi.mock("@bcgov/design-system-react-components", () =>
  import("../test/mockBcdsComponents").then((mod) =>
    mod.mockBcdsDesignSystem(),
  ),
);

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBcdsMocks } from "../test/mockBcdsComponents";

vi.mock("@mantine/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mantine/core")>();
  return {
    ...actual,
    Paper: ({
      children,
      className,
    }: {
      children?: React.ReactNode;
      className?: string;
    }) => <div className={className}>{children}</div>,
  };
});

import { PanelCard, SearchField, StatCard, StatusSelect } from "./index";

describe("UI adapter composites", () => {
  beforeEach(() => {
    getBcdsMocks().mockBcdsTextField.mockClear();
    getBcdsMocks().mockBcdsSelect.mockClear();
  });

  it("renders SearchField with BC DS TextField", () => {
    render(
      <SearchField value="" onChange={() => undefined} placeholder="Search" />,
    );
    expect(getBcdsMocks().mockBcdsTextField).toHaveBeenCalled();
  });

  it("renders StatusSelect with BC DS Select", () => {
    render(
      <StatusSelect
        data={[{ value: "pending", label: "Pending" }]}
        value="pending"
        onChange={() => undefined}
      />,
    );
    expect(getBcdsMocks().mockBcdsSelect).toHaveBeenCalled();
  });

  it("renders PanelCard and StatCard content", () => {
    render(
      <>
        <PanelCard>Panel body</PanelCard>
        <StatCard label="Total" value={12} />
      </>,
    );
    expect(screen.getByText("Panel body")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });
});
