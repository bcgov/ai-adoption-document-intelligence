import axios from "axios";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { apiService } from "../data/services/api.service";
import { API_BASE_URL } from "../shared/constants";

/**
 * Represents a group the user belongs to.
 */
export interface Group {
  id: string;
  name: string;
}

/**
 * Response shape from GET /api/auth/me.
 */
interface MeResponse {
  sub: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  roles: string[];
  expires_in: number;
  groups: Group[];
}

/**
 * Response shape from POST /api/auth/refresh.
 */
interface RefreshResponse {
  expires_in: number;
}

/**
 * Local representation of an authenticated user.
 * Profile data comes from the /me endpoint — the frontend never touches raw tokens.
 */
export interface AuthUser {
  sub: string;
  expires_at: number;
  profile: {
    name?: string;
    preferred_username?: string;
    email?: string;
    [key: string]: unknown;
  };
  roles: string[];
  groups: Group[];
}

/**
 * API exposed by the `AuthProvider`. Any component can consume these helpers via `useAuth`.
 */
interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  isSystemAdmin: boolean;
  user: AuthUser | null;
  login: () => void;
  logout: () => void;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Reads a cookie value by name from document.cookie.
 */
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Removes transient query params (`auth_error`) from the URL without reloading the page.
 */
function cleanAuthErrorFromUrl() {
  const url = new URL(window.location.href);
  if (url.searchParams.has("auth_error")) {
    url.searchParams.delete("auth_error");
    const newSearch = url.searchParams.toString();
    window.history.replaceState(
      {},
      document.title,
      `${url.pathname}${newSearch ? `?${newSearch}` : ""}${url.hash}`,
    );
  }
}

/**
 * Top-level provider that encapsulates all browser-side auth state.
 * Tokens are stored in HttpOnly cookies — the frontend never handles raw tokens.
 * Profile data and token expiry come from the GET /api/auth/me endpoint.
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initRef = useRef(false);

  const apiBaseUrl = API_BASE_URL;

  /**
   * Converts a /me response into local AuthUser state.
   */
  const meResponseToUser = useCallback((me: MeResponse): AuthUser => {
    const expiresAt = Math.floor(Date.now() / 1000) + me.expires_in;
    return {
      sub: me.sub,
      expires_at: expiresAt,
      profile: {
        name: me.name,
        preferred_username: me.preferred_username,
        email: me.email,
      },
      roles: me.roles,
      groups: me.groups ?? [],
    };
  }, []);

  /**
   * Fetches user profile from the /me endpoint. Cookies auto-attach.
   * Returns null if the user is not authenticated.
   */
  const fetchMe = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const response = await axios.get<MeResponse>(`${apiBaseUrl}/auth/me`, {
        withCredentials: true,
      });
      return meResponseToUser(response.data);
    } catch {
      return null;
    }
  }, [apiBaseUrl, meResponseToUser]);

  /**
   * Calls the backend refresh endpoint. Cookies auto-attach (refresh_token cookie).
   * The backend sets new auth cookies and returns { expires_in }.
   */
  const refreshToken = useCallback(async (): Promise<void> => {
    try {
      const csrfToken = getCookie("csrf_token");
      const response = await axios.post<RefreshResponse>(
        `${apiBaseUrl}/auth/refresh`,
        {},
        {
          withCredentials: true,
          headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {},
        },
      );

      const expiresAt =
        Math.floor(Date.now() / 1000) + response.data.expires_in;
      setUser((prev) => (prev ? { ...prev, expires_at: expiresAt } : prev));
    } catch {
      setUser(null);
    }
  }, [apiBaseUrl]);

  const logout = useCallback(() => {
    setUser(null);
    window.location.href = `${apiBaseUrl}/auth/logout`;
  }, [apiBaseUrl]);

  const login = useCallback(() => {
    window.location.href = `${apiBaseUrl}/auth/login`;
  }, [apiBaseUrl]);

  /**
   * On mount: call /me to check if the user has a valid session (cookie).
   * Clean up any auth_error query params left from failed login attempts.
   */
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const initAuth = async () => {
      try {
        cleanAuthErrorFromUrl();
        const userData = await fetchMe();
        setUser(userData);
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [fetchMe]);

  // Register refresh and logout callbacks with apiService for 401 handling
  useEffect(() => {
    apiService.setRefreshCallback(refreshToken);
    apiService.setLogoutCallback(logout);
  }, [refreshToken, logout]);

  // Proactive token refresh timer — refresh at 75% of token lifetime
  useEffect(() => {
    if (!user?.expires_at) return;

    const now = Math.floor(Date.now() / 1000);
    const tokenLifetime = user.expires_at - now;

    if (tokenLifetime <= 0) return;

    const refreshIn = Math.max(tokenLifetime * 0.75 * 1000, 10_000);

    const timerId = setTimeout(async () => {
      try {
        await refreshToken();
      } catch {
        // Refresh failed — the 401 interceptor will handle logout if needed
      }
    }, refreshIn);

    return () => clearTimeout(timerId);
  }, [user?.expires_at, refreshToken]);

  // Visibility change listener — refresh when user returns to tab if token expiring soon
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && user?.expires_at) {
        const now = Math.floor(Date.now() / 1000);
        const buffer = 60;
        if (user.expires_at - now < buffer) {
          // Intentionally swallowing errors — refresh failure is handled by the interceptor
          refreshToken().catch(() => {
            /* silent */
          });
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [user?.expires_at, refreshToken]);

  const value: AuthContextType = {
    isAuthenticated: !!user,
    isLoading,
    isSystemAdmin: user?.roles?.includes("system-admin") ?? false,
    user,
    login,
    logout,
    refreshToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Convenience hook for consuming the auth context with built-in guardrails.
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
