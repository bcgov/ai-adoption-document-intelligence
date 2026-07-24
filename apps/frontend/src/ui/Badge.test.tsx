import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const mockBcdsTag = vi.fn(
  ({
    textValue,
    color,
    size,
    tagStyle,
    icon,
  }: {
    textValue?: string;
    color?: string;
    size?: string;
    tagStyle?: string;
    icon?: ReactNode;
  }) => (
    <span
      data-testid="bcds-tag"
      data-text={textValue}
      data-color={color}
      data-size={size}
      data-style={tagStyle}
      data-has-icon={icon != null ? "true" : "false"}
    >
      {textValue}
    </span>
  ),
);

vi.mock("@bcgov/design-system-react-components", () => ({
  Tag: (props: Parameters<typeof mockBcdsTag>[0]) => mockBcdsTag(props),
  TagGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TagList: ({ items }: { items: Parameters<typeof mockBcdsTag>[0][] }) => (
    <>
      {items.map((item) => {
        mockBcdsTag(item);
        return (
          <span key={item.textValue} data-testid="bcds-tag">
            {item.textValue}
          </span>
        );
      })}
    </>
  ),
}));

import { Badge } from "./Badge";
import { mapMantineColorToTagColor } from "./tagUtils";

describe("mapMantineColorToTagColor", () => {
  it("maps orange to yellow", () => {
    expect(mapMantineColorToTagColor("orange")).toBe("yellow");
  });
});

describe("Badge adapter", () => {
  it("renders children as textValue", () => {
    render(<Badge color="blue">3 files</Badge>);
    expect(screen.getByText("3 files")).toBeInTheDocument();
    expect(mockBcdsTag).toHaveBeenCalledWith(
      expect.objectContaining({
        textValue: "3 files",
        color: "blue",
        tagStyle: "circular",
      }),
    );
  });

  it("maps circle to circular tagStyle", () => {
    mockBcdsTag.mockClear();
    render(
      <Badge circle data-testid="count">
        2
      </Badge>,
    );
    expect(mockBcdsTag).toHaveBeenCalledWith(
      expect.objectContaining({ tagStyle: "circular" }),
    );
    expect(screen.getByTestId("count")).toBeInTheDocument();
  });

  it("forwards leftSection as icon", () => {
    mockBcdsTag.mockClear();
    render(
      <Badge leftSection={<span data-testid="icon">*</span>}>Label</Badge>,
    );
    expect(mockBcdsTag).toHaveBeenCalledWith(
      expect.objectContaining({ icon: expect.anything() }),
    );
  });
});
