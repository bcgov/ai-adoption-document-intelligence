import { describe, expect, it, vi } from "vitest";

vi.mock("@bcgov/design-system-react-components", () =>
  import("../test/mockBcdsComponents").then((mod) =>
    mod.mockBcdsDesignSystem(),
  ),
);

import { render, screen } from "@testing-library/react";

vi.mock("@mantine/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mantine/core")>();
  return {
    ...actual,
    Group: ({ children }: { children?: React.ReactNode }) => (
      <div>{children}</div>
    ),
    Stack: ({ children }: { children?: React.ReactNode }) => (
      <div>{children}</div>
    ),
  };
});

vi.mock("./Badge", () => ({
  Badge: ({ children }: { children?: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
}));

import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renders title, description, actions, and no date badge by default", () => {
    render(
      <PageHeader
        title="Processing Queue"
        description="Track documents"
        actions={<button type="button">Refresh</button>}
      />,
    );

    expect(screen.getByText("Processing Queue")).toBeInTheDocument();
    expect(screen.getByText("Track documents")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.queryByTestId("badge")).not.toBeInTheDocument();
  });

  it("can show the date badge when requested", () => {
    render(<PageHeader title="Processing Queue" showDateBadge />);
    expect(screen.getByTestId("badge")).toBeInTheDocument();
  });

  it("can hide the date badge", () => {
    render(<PageHeader title="Settings" showDateBadge={false} />);
    expect(screen.queryByTestId("badge")).not.toBeInTheDocument();
  });
});
