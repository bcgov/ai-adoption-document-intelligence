import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/api.service';
import type { OcrResult } from '../../shared/types';

export function useDocumentOcr(documentId?: string) {
  return useQuery({
    queryKey: ['document-ocr', documentId],
    queryFn: async (): Promise<OcrResult> => {
      const response = await apiService.get<OcrResult>(`/documents/${documentId}/ocr`);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || 'Failed to fetch OCR result');
    },
    enabled: Boolean(documentId),
    staleTime: 1000 * 60 * 2,
  });
}

