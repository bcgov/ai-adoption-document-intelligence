import { Button, Center, Stack, Text, Title } from "@mantine/core";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  retryCount: number;
}

const MAX_RETRIES = 3;

/**
 * React error boundary that catches unhandled errors in the component tree,
 * displays a user-friendly message, and silently logs the error to the console.
 * After exceeding the retry limit, redirects the user to the home page.
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
    console.error("An unexpected error occurred:", error, info.componentStack);
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
