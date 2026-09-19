import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "@/data/services/api.service";
import { FieldType } from "../../core/types/field";
import { useFieldSchema } from "./useFieldSchema";

vi.mock("@/data/services/api.service", () => ({
  apiService: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useFieldSchema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps the description from the API", async () => {
    vi.mocked(apiService.get).mockResolvedValue({
      data: [
        {
          id: "f1",
          field_key: "filing_date",
          field_type: "date",
          description: "Date at the bottom",
          display_order: 0,
        },
      ],
      success: true,
    });
    const { result } = renderHook(() => useFieldSchema("tm-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.schema).toHaveLength(1));
    expect(result.current.schema[0].description).toBe("Date at the bottom");
  });

  it("adds several fields through the bulk endpoint", async () => {
    vi.mocked(apiService.get).mockResolvedValue({ data: [], success: true });
    vi.mocked(apiService.post).mockResolvedValue({
      data: [
        {
          id: "f2",
          field_key: "file_number",
          field_type: "string",
          description: "Court file number",
          display_order: 0,
        },
      ],
      success: true,
    });
    const { result } = renderHook(() => useFieldSchema("tm-1"), {
      wrapper: createWrapper(),
    });

    const created = await result.current.addFieldsAsync([
      {
        field_key: "file_number",
        field_type: FieldType.STRING,
        description: "Court file number",
      },
    ]);

    expect(apiService.post).toHaveBeenCalledWith(
      "/template-models/tm-1/fields/bulk",
      {
        fields: [
          {
            field_key: "file_number",
            field_type: "string",
            description: "Court file number",
          },
        ],
      },
    );
    expect(created[0]).toEqual(
      expect.objectContaining({
        fieldKey: "file_number",
        description: "Court file number",
      }),
    );
  });

  it("rejects a failed bulk add with the server's message", async () => {
    vi.mocked(apiService.get).mockResolvedValue({ data: [], success: true });
    vi.mocked(apiService.post).mockResolvedValue({
      data: null,
      success: false,
      message: "These field keys already exist or repeat in the request",
    });
    const { result } = renderHook(() => useFieldSchema("tm-1"), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.addFieldsAsync([
        { field_key: "a", field_type: FieldType.STRING },
      ]),
    ).rejects.toThrow(
      "These field keys already exist or repeat in the request",
    );
  });
});
