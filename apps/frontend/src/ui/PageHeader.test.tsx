import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
  it("renders title, description, actions, and date badge", () => {
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
    expect(screen.getByTestId("badge")).toBeInTheDocument();
  });

  it("can hide the date badge", () => {
    render(<PageHeader title="Settings" showDateBadge={false} />);
    expect(screen.queryByTestId("badge")).not.toBeInTheDocument();
  });
});
