import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "@/data/services/api.service";
import { type ApiResponse, RejectionReason } from "@/shared/types";
import { useReviewSession } from "./useReviewSession";

vi.mock("@/data/services/api.service", () => ({
  apiService: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

/** What apiService returns when the server answers with an error status. */
const refused: ApiResponse<null> = {
  success: false,
  data: null,
  message: "Cannot reject a session that is abandoned",
};

type Hook = ReturnType<typeof useReviewSession>;

describe("useReviewSession actions", () => {
  beforeEach(() => {
    vi.mocked(apiService.get).mockResolvedValue({
      success: true,
      data: undefined,
    });
  });

  it.each<[string, (hook: Hook) => Promise<unknown>]>([
    ["approve", (hook) => hook.approveSessionAsync()],
    ["skip", (hook) => hook.skipSessionAsync()],
    ["flag", (hook) => hook.flagSessionAsync({})],
    [
      "reject",
      (hook) =>
        hook.rejectSessionAsync({
          rejectionReason: RejectionReason.INPUT_QUALITY,
        }),
    ],
    ["submit corrections", (hook) => hook.submitCorrectionsAsync([])],
  ])("%s throws the server's message when it is refused", async (_, run) => {
    vi.mocked(apiService.post).mockResolvedValueOnce(refused);
    const { result } = renderHook(() => useReviewSession("session-1"), {
      wrapper: createWrapper(),
    });

    await expect(run(result.current)).rejects.toThrow(
      "Cannot reject a session that is abandoned",
    );
  });

  it("delete correction throws when it is refused", async () => {
    vi.mocked(apiService.delete).mockResolvedValueOnce(refused);
    const { result } = renderHook(() => useReviewSession("session-1"), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.deleteCorrectionAsync({ correctionId: "correction-1" }),
    ).rejects.toThrow("Cannot reject a session that is abandoned");
  });

  it("sends the reason and comment, and resolves on success", async () => {
    vi.mocked(apiService.post).mockResolvedValueOnce({
      success: true,
      data: { id: "session-1", status: "rejected" },
    });
    const { result } = renderHook(() => useReviewSession("session-1"), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.rejectSessionAsync({
        rejectionReason: RejectionReason.MODEL_MISMATCH,
        comments: "This is a T4, not a monthly report.",
      }),
    ).resolves.toEqual({ id: "session-1", status: "rejected" });
    expect(apiService.post).toHaveBeenCalledWith(
      "/hitl/sessions/session-1/reject",
      {
        rejectionReason: RejectionReason.MODEL_MISMATCH,
        comments: "This is a T4, not a monthly report.",
      },
    );
  });
});
