import axios, {
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import { API_BASE_URL } from "../../shared/constants";
import type { ApiResponse } from "../../shared/types";

class ApiService {
  private axiosInstance: AxiosInstance;
  private authToken: string | null = null;

  constructor(baseURL: string = API_BASE_URL) {
    this.axiosInstance = axios.create({
      baseURL,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Add request interceptor for authentication
    this.axiosInstance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        if (
          this.authToken &&
          this.authToken !== "undefined" &&
          config.headers
        ) {
          config.headers.Authorization = `Bearer ${this.authToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        // Error handling - logging removed for lint compliance
        return Promise.reject(error);
      },
    );
  }

  // Method to set the authentication token
  setAuthToken(token: string | null) {
    this.authToken = token;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    endpoint: string,
    data?: unknown,
  ): Promise<ApiResponse<T>> {
    try {
      let headers = undefined;
      let payload = data;
      // If data is FormData, remove Content-Type so browser/axios sets it correctly
      if (typeof FormData !== "undefined" && data instanceof FormData) {
        headers = { ...this.axiosInstance.defaults.headers.common };
        // Remove Content-Type so axios/browser sets it with boundary
        if (headers["Content-Type"]) delete headers["Content-Type"];
      }
      const response: AxiosResponse<T> = await this.axiosInstance({
        method,
        url: endpoint,
        data: payload,
        ...(headers ? { headers } : {}),
      });

      return {
        data: response.data,
        success: true,
      };
    } catch (error) {
      // Error handling - logging removed for lint compliance
      return {
        data: null as T,
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>("GET", endpoint);
  }

  async post<T>(endpoint: string, data: unknown): Promise<ApiResponse<T>> {
    return this.request<T>("POST", endpoint, data);
  }

  async put<T>(endpoint: string, data: unknown): Promise<ApiResponse<T>> {
    return this.request<T>("PUT", endpoint, data);
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>("DELETE", endpoint);
  }
}

export const apiService = new ApiService();
