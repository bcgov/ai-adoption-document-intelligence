import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "@/data/services/api.service";
import { notifications } from "../../../../ui";
import { useSessionHeartbeat } from "./useSessionHeartbeat";

const navigate = vi.fn();

vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
vi.mock("@/data/services/api.service", () => ({
  apiService: { post: vi.fn() },
}));
vi.mock("../../../../ui", () => ({ notifications: { show: vi.fn() } }));

describe("useSessionHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigate.mockReset();
    vi.mocked(notifications.show).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns to the queue when the server says the lock is gone", async () => {
    // apiService reports a refused request rather than throwing it.
    vi.mocked(apiService.post).mockResolvedValue({
      success: false,
      message: "Lock expired or session not found",
      data: { statusCode: 409, message: "Lock expired or session not found" },
    });

    renderHook(() => useSessionHeartbeat("session-1", "/review"));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(apiService.post).toHaveBeenCalledWith(
      "/hitl/sessions/session-1/heartbeat",
      {},
    );
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Session expired",
        message:
          "Your session was released due to inactivity. Changes you hadn't saved were not kept.",
      }),
    );
    expect(navigate).toHaveBeenCalledWith("/review");
  });

  it("keeps the reviewer on the page when a heartbeat fails for another reason", async () => {
    vi.mocked(apiService.post).mockResolvedValue({
      success: false,
      message: "Bad gateway",
      data: null,
    });

    renderHook(() => useSessionHeartbeat("session-1", "/review"));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(navigate).not.toHaveBeenCalled();
    expect(notifications.show).not.toHaveBeenCalled();
  });
});
