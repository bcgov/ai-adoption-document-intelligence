import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/api.service';
import type { Document } from '../../shared/types';

export function useDocuments(): ReturnType<typeof useQuery<Document[], Error>> {
  return useQuery({
    queryKey: ['documents'],
    queryFn: async (): Promise<Document[]> => {
      const response = await apiService.get<Document[]>('/documents');
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || 'Failed to fetch documents');
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
