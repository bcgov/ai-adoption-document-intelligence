import { vi } from "vitest";

/**
 * Shared BC DS mock for UI adapter unit tests.
 * Centralized here so individual test files do not repeat vi.mock (CodeQL / review noise).
 */
vi.mock("@bcgov/design-system-react-components", () =>
  import("./mockBcdsComponents").then((mod) => mod.mockBcdsDesignSystem()),
);
