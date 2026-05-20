import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "../data/services/api.service";
import { ErrorBoundary } from "./ErrorBoundary";

vi.mock("../data/services/api.service", () => ({
  apiService: {
    post: vi.fn().mockResolvedValue({ success: true, data: null }),
  },
}));

const mockPost = vi.mocked(apiService.post);

const Wrapper = ({ children }: { children: ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

let throwOnNextRender = false;

const ThrowingChild = () => {
  if (throwOnNextRender) throw new Error("Test render error");
  return <div>Safe content</div>;
};

beforeEach(() => {
  vi.clearAllMocks();
  throwOnNextRender = false;
  // Suppress React's console.error output for intentional error boundary tests
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("ErrorBoundary", () => {
  it("renders children when no error is thrown", () => {
    throwOnNextRender = false;

    render(
      <Wrapper>
        <ErrorBoundary>
          <ThrowingChild />
        </ErrorBoundary>
      </Wrapper>,
    );

    expect(screen.getByText("Safe content")).toBeInTheDocument();
  });

  it("shows the fallback UI when a child throws", () => {
    throwOnNextRender = true;

    render(
      <Wrapper>
        <ErrorBoundary>
          <ThrowingChild />
        </ErrorBoundary>
      </Wrapper>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("reports the error to the backend on catch", () => {
    throwOnNextRender = true;

    render(
      <Wrapper>
        <ErrorBoundary>
          <ThrowingChild />
        </ErrorBoundary>
      </Wrapper>,
    );

    expect(mockPost).toHaveBeenCalledWith(
      "client-errors",
      expect.objectContaining({ message: "Test render error" }),
    );
  });

  it("resets and shows children again when Try again is clicked and error is resolved", () => {
    throwOnNextRender = true;

    render(
      <Wrapper>
        <ErrorBoundary>
          <ThrowingChild />
        </ErrorBoundary>
      </Wrapper>,
    );

    throwOnNextRender = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("Safe content")).toBeInTheDocument();
  });

  it("shows Go to home page button on the final retry attempt", () => {
    throwOnNextRender = true;

    render(
      <Wrapper>
        <ErrorBoundary>
          <ThrowingChild />
        </ErrorBoundary>
      </Wrapper>,
    );

    // Click through until the last attempt (MAX_RETRIES - 1 = 2 retries,
    // error persists so the boundary re-catches each time)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      screen.getByRole("button", { name: "Go to home page" }),
    ).toBeInTheDocument();
  });

  it("redirects to home when Go to home page is clicked", () => {
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
    });

    throwOnNextRender = true;

    render(
      <Wrapper>
        <ErrorBoundary>
          <ThrowingChild />
        </ErrorBoundary>
      </Wrapper>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(screen.getByRole("button", { name: "Go to home page" }));

    expect(window.location.href).toBe("/");

    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
  });
});
