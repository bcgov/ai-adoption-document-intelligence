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
  private refreshCallback: (() => Promise<void>) | null = null;
  private refreshPromise: Promise<void> | null = null;
  private logoutCallback: (() => void) | null = null;

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

    // Add response interceptor for error handling and token refresh
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // Handle 401 errors with automatic token refresh
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          // Single-flight: reuse existing refresh promise if one is in-flight
          if (!this.refreshPromise && this.refreshCallback) {
            this.refreshPromise = this.refreshCallback()
              .finally(() => {
                this.refreshPromise = null;
              });
          }

          if (this.refreshPromise) {
            try {
              await this.refreshPromise;
              // Update the Authorization header with the new token
              if (this.authToken && originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${this.authToken}`;
              }
              // Retry the original request
              return this.axiosInstance(originalRequest);
            } catch {
              // Refresh failed — redirect to login
              if (this.logoutCallback) {
                this.logoutCallback();
              }
              return Promise.reject(error);
            }
          }
        }

        return Promise.reject(error);
      },
    );
  }

  // Method to register the token refresh callback from AuthContext
  setRefreshCallback(callback: () => Promise<void>) {
    this.refreshCallback = callback;
  }

  // Method to register the logout callback from AuthContext
  setLogoutCallback(callback: () => void) {
    this.logoutCallback = callback;
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
