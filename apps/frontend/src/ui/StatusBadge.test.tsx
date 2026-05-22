import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockBcdsTag = vi.fn(
  ({
    textValue,
    color,
    size,
    tagStyle,
    className,
  }: {
    textValue?: string;
    color?: string;
    size?: string;
    tagStyle?: string;
    className?: string;
  }) => (
    <span
      data-testid="bcds-tag"
      data-text={textValue}
      data-color={color}
      data-size={size}
      data-style={tagStyle}
      data-class={className}
    >
      {textValue}
    </span>
  ),
);

vi.mock("@bcgov/design-system-react-components", () => ({
  Tag: (props: Parameters<typeof mockBcdsTag>[0]) => mockBcdsTag(props),
}));

import { StatusBadge } from "./StatusBadge";
import { mapMantineColorToTagColor } from "./tagUtils";

describe("mapMantineColorToTagColor", () => {
  it("maps standard status colors", () => {
    expect(mapMantineColorToTagColor("green")).toBe("green");
    expect(mapMantineColorToTagColor("red")).toBe("red");
    expect(mapMantineColorToTagColor("gray")).toBe("gray");
  });

  it("maps orange to yellow (BC DS has no orange token)", () => {
    expect(mapMantineColorToTagColor("orange")).toBe("yellow");
  });
});

describe("StatusBadge adapter", () => {
  it("renders label as textValue with mapped color", () => {
    render(<StatusBadge color="orange">Needs Review</StatusBadge>);
    expect(screen.getByText("Needs Review")).toBeInTheDocument();
    expect(mockBcdsTag).toHaveBeenCalledWith(
      expect.objectContaining({
        textValue: "Needs Review",
        color: "yellow",
        tagStyle: "circular",
      }),
    );
    expect(
      screen.getByText("Needs Review").closest(".bcds-status-badge"),
    ).toBeTruthy();
  });

  it("maps small Mantine size to BC DS small", () => {
    mockBcdsTag.mockClear();
    render(
      <StatusBadge color="green" size="xs">
        Complete
      </StatusBadge>,
    );
    expect(mockBcdsTag).toHaveBeenCalledWith(
      expect.objectContaining({ size: "small" }),
    );
  });
});
