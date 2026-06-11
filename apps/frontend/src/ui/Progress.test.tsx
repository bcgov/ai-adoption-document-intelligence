import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@bcgov/design-system-react-components", () =>
  import("../test/mockBcdsComponents").then((mod) =>
    mod.mockBcdsDesignSystem(),
  ),
);

import { render, screen } from "@testing-library/react";
import { getBcdsMocks } from "../test/mockBcdsComponents";
import { Progress } from "./Progress";

describe("Progress adapter", () => {
  beforeEach(() => {
    getBcdsMocks().mockBcdsProgressBar.mockClear();
  });

  it("passes value to BC DS ProgressBar", () => {
    render(<Progress value={42} />);
    expect(getBcdsMocks().mockBcdsProgressBar).toHaveBeenCalledWith(
      expect.objectContaining({ value: 42 }),
    );
  });

  it("uses indeterminate mode when animated without value", () => {
    render(<Progress animated data-testid="progress" />);
    expect(getBcdsMocks().mockBcdsProgressBar).toHaveBeenCalledWith(
      expect.objectContaining({ isIndeterminate: true, value: undefined }),
    );
    expect(screen.getByTestId("progress")).toBeInTheDocument();
  });
});
