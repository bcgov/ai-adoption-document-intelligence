import { useQuery } from "@tanstack/react-query";
import type { OcrEndpointResponse } from "../../shared/types";
import { apiService } from "../services/api.service";

export function useDocumentOcr(documentId?: string) {
  return useQuery({
    queryKey: ["document-ocr", documentId],
    queryFn: async (): Promise<OcrEndpointResponse> => {
      const response = await apiService.get<OcrEndpointResponse>(
        `/documents/${documentId}/ocr`,
      );
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || "Failed to fetch OCR result");
    },
    enabled: Boolean(documentId),
    staleTime: 1000 * 60 * 2,
  });
}
