import { useContext } from "react";
import { AuthContext, AuthContextType } from "./AuthContext";

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
