import { Component, type ErrorInfo, type ReactNode } from "react";
import { apiService } from "../data/services/api.service";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  retryCount: number;
}

const MAX_RETRIES = 3;

/**
 * React error boundary that catches unhandled errors thrown by providers above
 * the router (AuthProvider, GroupProvider, QueryClientProvider) and by App
 * itself. It does NOT catch errors inside route components — those are handled
 * by RouterErrorPage via React Router's errorElement mechanism.
 *
 * Reports caught errors to the backend logging endpoint and displays a
 * user-friendly fallback UI. Redirects to the home page after exceeding the
 * retry limit.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, retryCount: 0 };
  }

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void apiService.post("client-errors", {
      message: error.message,
      componentStack: info.componentStack ?? undefined,
      errorStack: error.stack ?? undefined,
      url: window.location.href,
      userAgent: navigator.userAgent,
    });
  }

  handleReset = (): void => {
    const nextCount = this.state.retryCount + 1;
    if (nextCount >= MAX_RETRIES) {
      window.location.href = "/";
      return;
    }
    this.setState({ hasError: false, retryCount: nextCount });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const attemptsLeft = MAX_RETRIES - this.state.retryCount;
      return (
        <div
          style={{
            display: "flex",
            height: "100vh",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <h2 style={{ margin: 0 }}>Something went wrong</h2>
            <p style={{ margin: 0, color: "#888" }}>
              An unexpected error occurred. Please try again or contact support
              if the problem persists.
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              style={{ padding: "8px 16px", cursor: "pointer" }}
            >
              {attemptsLeft <= 1 ? "Go to home page" : "Try again"}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
