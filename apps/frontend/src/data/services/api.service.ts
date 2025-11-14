import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { API_BASE_URL } from '../../shared/constants';
import type { ApiResponse } from '../../shared/types';

class ApiService {
  private axiosInstance: AxiosInstance;

  constructor(baseURL: string = API_BASE_URL) {
    this.axiosInstance = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        // Log error in development only
        if (import.meta.env.DEV) {
          console.error('API request failed:', error);
        }
        return Promise.reject(error);
      }
    );
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    data?: unknown
  ): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await this.axiosInstance({
        method,
        url: endpoint,
        data,
      });

      return {
        data: response.data,
        success: true,
      };
    } catch (error) {
      // Log error in development only
      if (import.meta.env.DEV) {
        console.error('API request failed:', error);
      }
      return {
        data: null as T,
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', endpoint);
  }

  async post<T>(endpoint: string, data: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('POST', endpoint, data);
  }

  async put<T>(endpoint: string, data: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', endpoint, data);
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', endpoint);
  }
}

export const apiService = new ApiService();
