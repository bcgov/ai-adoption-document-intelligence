import { Button, Center, Stack, Text, Title } from "@mantine/core";
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
        <Center style={{ height: "100vh" }}>
          <Stack align="center" gap="md">
            <Title order={2}>Something went wrong</Title>
            <Text c="dimmed">
              An unexpected error occurred. Please try again or contact support
              if the problem persists.
            </Text>
            <Button variant="filled" onClick={this.handleReset}>
              {attemptsLeft <= 1 ? "Go to home page" : "Try again"}
            </Button>
          </Stack>
        </Center>
      );
    }

    return this.props.children;
  }
}
