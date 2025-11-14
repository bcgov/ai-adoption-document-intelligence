import { useState, useEffect } from 'react';
import { apiService } from '../services/api.service';
import type { ApiResponse } from '../../shared/types';

export function useApi<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  data?: any,
  dependencies: any[] = []
) {
  const [response, setResponse] = useState<ApiResponse<T> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        let result: ApiResponse<T>;

        switch (method) {
          case 'GET':
            result = await apiService.get<T>(endpoint);
            break;
          case 'POST':
            result = await apiService.post<T>(endpoint, data);
            break;
          case 'PUT':
            result = await apiService.put<T>(endpoint, data);
            break;
          case 'DELETE':
            result = await apiService.delete<T>(endpoint);
            break;
          default:
            throw new Error(`Unsupported method: ${method}`);
        }

        setResponse(result);
        if (!result.success && result.message) {
          setError(result.message);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        setResponse({
          data: null as T,
          success: false,
          message: errorMessage,
        });
      } finally {
        setLoading(false);
      }
    };

    if (endpoint) {
      fetchData();
    }
  }, [endpoint, method, data, ...dependencies]);

  return { response, loading, error };
}
