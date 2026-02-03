import axios from "axios";
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { apiService } from "../data/services/api.service";
import { API_BASE_URL } from "../shared/constants";

/**
 * Shape of the token bundle returned by the backend `/auth/token` or `/auth/result` endpoints.
 * Mirrors Keycloak's response so we can store it locally and forward it with each API call.
 */
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
}

/**
 * Local representation of an authenticated user, enriched with decoded ID token data.
 */
interface AuthUser {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_at?: number;
  profile?: {
    name?: string;
    preferred_username?: string;
    email?: string;
    [key: string]: unknown;
  };
}

/**
 * API exposed by the `AuthProvider`. Any component can consume these helpers via `useAuth`.
 */
interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  login: () => void;
  logout: () => void;
  getAccessToken: () => string | null;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Top-level provider that encapsulates all browser-side auth state.
 * It keeps the SPA stateless by simply persisting provider tokens and letting the backend handle OAuth.
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const handledAuthResultIdsRef = useRef<Set<string>>(new Set());

  // Use same API base as rest of app (VITE_API_BASE_URL); relative /api in dev, full backend URL in prod
  const apiBaseUrl = API_BASE_URL;

  useEffect(() => {
    const initAuth = async () => {
      try {
        await restoreStoredTokens();
        await handleAuthResultFromUrl();
      } catch (_error) {
        // Auth initialization error - removed console for lint compliance
        localStorage.removeItem("auth_tokens");
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  useEffect(() => {
    apiService.setAuthToken(user?.access_token ?? null);
  }, [user?.access_token]);

  /**
   * Rehydrates the last known token set from localStorage and refreshes if necessary.
   */
  const restoreStoredTokens = async () => {
    const storedTokens = localStorage.getItem("auth_tokens");
    if (!storedTokens) {
      return;
    }

    const tokens: TokenResponse & { expires_at?: number } =
      JSON.parse(storedTokens);
    const now = Math.floor(Date.now() / 1000);

    if (tokens.expires_at && tokens.expires_at > now) {
      const userData = await decodeAndCreateUser(tokens);
      setUser(userData);
      return;
    }

    if (tokens.refresh_token) {
      try {
        await refreshToken();
      } catch (_error) {
        // Token refresh failed - removed console for lint compliance
        localStorage.removeItem("auth_tokens");
        setUser(null);
      }
    } else {
      localStorage.removeItem("auth_tokens");
      setUser(null);
    }
  };

  /**
   * Decodes the ID token (if present) to provide profile metadata throughout the app.
   */
  const decodeAndCreateUser = async (
    tokens: TokenResponse & { expires_at?: number },
  ): Promise<AuthUser> => {
    let profilePayload: Record<string, unknown> | undefined;

    if (tokens.id_token) {
      try {
        const base64Payload = tokens.id_token.split(".")[1];
        if (base64Payload) {
          const normalized = base64Payload
            .replace(/-/g, "+")
            .replace(/_/g, "/");
          const padded = normalized.padEnd(
            normalized.length + ((4 - (normalized.length % 4)) % 4),
            "=",
          );
          profilePayload = JSON.parse(atob(padded));
        }
      } catch (_error) {
        // Ignore parsing errors - profile payload is optional
      }
    }

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      id_token: tokens.id_token,
      expires_at: tokens.expires_at,
      profile: profilePayload
        ? {
            name: profilePayload.name as string | undefined,
            preferred_username: profilePayload.preferred_username as
              | string
              | undefined,
            email: profilePayload.email as string | undefined,
            ...profilePayload,
          }
        : undefined,
    };
  };

  /**
   * Persists a token response, derives expiry, and updates React state.
   */
  const persistTokens = async (tokens: TokenResponse) => {
    const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;
    const tokenData = { ...tokens, expires_at: expiresAt };
    localStorage.setItem("auth_tokens", JSON.stringify(tokenData));
    const userData = await decodeAndCreateUser(tokenData);
    setUser(userData);
  };

  /**
   * Removes transient query params (`auth_result` / `auth_error`) without reloading the page.
   */
  const updateBrowserUrl = (url: URL) => {
    const newSearch = url.searchParams.toString();
    window.history.replaceState(
      {},
      document.title,
      `${url.pathname}${newSearch ? `?${newSearch}` : ""}${url.hash}`,
    );
  };

  /**
   * Detects the backend redirect (`?auth_result=<uuid>`) and exchanges it for the actual token bundle.
   * The `handledAuthResultIdsRef` ensures React StrictMode does not double-consume the value.
   */
  const handleAuthResultFromUrl = async () => {
    const url = new URL(window.location.href);
    const authResult = url.searchParams.get("auth_result");

    if (!authResult) {
      if (url.searchParams.has("auth_error")) {
        url.searchParams.delete("auth_error");
        updateBrowserUrl(url);
      }
      return;
    }

    if (handledAuthResultIdsRef.current.has(authResult)) {
      return;
    }
    handledAuthResultIdsRef.current.add(authResult);

    try {
      const response = await axios.get<TokenResponse>(
        `${apiBaseUrl}/auth/result`,
        {
          params: { result: authResult },
        },
      );

      await persistTokens(response.data);
    } catch (_error) {
      localStorage.removeItem("auth_tokens");
      setUser(null);
    } finally {
      url.searchParams.delete("auth_result");
      updateBrowserUrl(url);
    }
  };

  const login = () => {
    const loginUrl = `${apiBaseUrl}/auth/login`;
    window.location.href = loginUrl;
  };

  const logout = () => {
    const idTokenHint = user?.id_token;
    setUser(null);
    localStorage.removeItem("auth_tokens");
    const logoutUrl = idTokenHint
      ? `${apiBaseUrl}/auth/logout?id_token_hint=${encodeURIComponent(idTokenHint)}`
      : `${apiBaseUrl}/auth/logout`;
    window.location.href = logoutUrl;
  };

  const getAccessToken = (): string | null => {
    return user?.access_token || null;
  };

  /**
   * Calls the backend refresh endpoint with the stored refresh token and rehydrates local state.
   */
  const refreshToken = async (): Promise<void> => {
    try {
      const storedTokens = localStorage.getItem("auth_tokens");
      if (!storedTokens) {
        throw new Error("No tokens to refresh");
      }

      const tokens = JSON.parse(storedTokens);
      if (!tokens.refresh_token) {
        throw new Error("No refresh token available");
      }

      const response = await axios.post<TokenResponse>(
        `${apiBaseUrl}/auth/refresh`,
        {
          refresh_token: tokens.refresh_token,
        },
      );

      await persistTokens(response.data);
    } catch (error) {
      // Clear invalid tokens
      localStorage.removeItem("auth_tokens");
      setUser(null);
      throw error;
    }
  };

  const value: AuthContextType = {
    isAuthenticated: !!user,
    isLoading,
    user,
    login,
    logout,
    getAccessToken,
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
// Backwards compatibility alias for useSSO
export const useSSO = useAuth;
