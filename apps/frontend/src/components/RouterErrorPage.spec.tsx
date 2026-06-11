import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "../data/services/api.service";
import { RouterErrorPage } from "./RouterErrorPage";

vi.mock("../data/services/api.service", () => ({
  apiService: {
    post: vi.fn().mockResolvedValue({ success: true, data: null }),
  },
}));

const mockNavigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useRouteError: vi.fn(),
  useNavigate: () => mockNavigate,
}));

import { useRouteError } from "react-router-dom";

const mockUseRouteError = vi.mocked(useRouteError);
const mockPost = vi.mocked(apiService.post);

const renderPage = () =>
  render(
    <MantineProvider>
      <RouterErrorPage />
    </MantineProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RouterErrorPage", () => {
  it("renders the error fallback UI", () => {
    mockUseRouteError.mockReturnValue(new Error("Route crashed"));

    renderPage();

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Go to home page" }),
    ).toBeInTheDocument();
  });

  it("reports an Error instance to the backend", async () => {
    const error = new Error("Route crashed");
    mockUseRouteError.mockReturnValue(error);

    renderPage();

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "client-errors",
        expect.objectContaining({
          message: "Route crashed",
          errorStack: error.stack,
        }),
      );
    });
  });

  it("reports a non-Error thrown value to the backend", async () => {
    mockUseRouteError.mockReturnValue("404 Not Found");

    renderPage();

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "client-errors",
        expect.objectContaining({ message: "404 Not Found" }),
      );
    });
  });

  it("navigates to / when Go to home page is clicked", () => {
    mockUseRouteError.mockReturnValue(new Error("Route crashed"));

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Go to home page" }));

    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});
