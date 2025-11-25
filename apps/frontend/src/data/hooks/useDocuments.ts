import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/api.service';
import type { Document } from '../../shared/types';

interface UseDocumentsOptions {
  refetchInterval?: number;
  staleTime?: number;
}

export function useDocuments(options?: UseDocumentsOptions): ReturnType<typeof useQuery<Document[], Error>> {
  return useQuery({
    queryKey: ['documents'],
    queryFn: async (): Promise<Document[]> => {
      const response = await apiService.get<Document[]>('/documents');
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || 'Failed to fetch documents');
    },
    staleTime: options?.staleTime ?? 1000 * 60 * 5,
    refetchInterval: options?.refetchInterval,
  });
}
