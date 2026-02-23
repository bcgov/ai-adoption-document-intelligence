import axios, {
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import { API_BASE_URL } from "../../shared/constants";
import type { ApiResponse } from "../../shared/types";

function getCsrfToken(): string | undefined {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrf_token="));
  return match?.split("=")[1];
}

class ApiService {
  private axiosInstance: AxiosInstance;
  private refreshCallback: (() => Promise<void>) | null = null;
  private refreshPromise: Promise<void> | null = null;
  private logoutCallback: (() => void) | null = null;

  constructor(baseURL: string = API_BASE_URL) {
    this.axiosInstance = axios.create({
      baseURL,
      withCredentials: true,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Add request interceptor for CSRF token on state-changing requests
    this.axiosInstance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const method = config.method?.toUpperCase();
        if (method && !["GET", "HEAD", "OPTIONS"].includes(method)) {
          const csrfToken = getCsrfToken();
          if (csrfToken && config.headers) {
            config.headers["X-CSRF-Token"] = csrfToken;
          }
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
            this.refreshPromise = this.refreshCallback().finally(() => {
              this.refreshPromise = null;
            });
          }

          if (this.refreshPromise) {
            try {
              await this.refreshPromise;
              // Retry the original request (cookies auto-attach)
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

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    endpoint: string,
    data?: unknown,
  ): Promise<ApiResponse<T>> {
    try {
      let headers = undefined;
      const payload = data;
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

  async patch<T>(endpoint: string, data: unknown): Promise<ApiResponse<T>> {
    return this.request<T>("PATCH", endpoint, data);
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>("DELETE", endpoint);
  }
}

export const apiService = new ApiService();
