import { render, screen } from "@testing-library/react";
import type { CSSProperties, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBcdsText, mockBcdsHeading } = vi.hoisted(() => ({
  mockBcdsText: vi.fn(
    ({
      children,
      elementType,
      size,
      color,
      className,
      style,
    }: {
      children: ReactNode;
      elementType?: string;
      size?: string;
      color?: string;
      className?: string;
      style?: CSSProperties;
    }) => (
      <span
        data-testid="bcds-text"
        data-element={elementType}
        data-size={size}
        data-color={color}
        data-class={className}
        style={style}
      >
        {children}
      </span>
    ),
  ),
  mockBcdsHeading: vi.fn(
    ({
      children,
      level,
      color,
      style,
      slot,
    }: {
      children: ReactNode;
      level?: number;
      color?: string;
      style?: CSSProperties;
      slot?: string;
    }) => (
      <span
        data-testid="bcds-heading"
        data-level={level}
        data-color={color}
        data-slot={slot}
        style={style}
      >
        {children}
      </span>
    ),
  ),
}));

vi.mock("@bcgov/design-system-react-components", () => ({
  Text: (props: Parameters<typeof mockBcdsText>[0]) => mockBcdsText(props),
  Heading: (props: Parameters<typeof mockBcdsHeading>[0]) =>
    mockBcdsHeading(props),
}));

import { Text } from "./Text";
import { Title } from "./Title";
import {
  mapMantineColor,
  mapMantineTextSize,
  mapMantineTitleOrder,
} from "./typographyUtils";

describe("typographyUtils", () => {
  it("maps Mantine text sizes to BC DS", () => {
    expect(mapMantineTextSize("xs")).toBe("small");
    expect(mapMantineTextSize("lg")).toBe("large");
    expect(mapMantineTextSize(undefined)).toBe("medium");
  });

  it("maps Mantine colors to BC DS semantics", () => {
    expect(mapMantineColor("dimmed")).toEqual({ bcdsColor: "secondary" });
    expect(mapMantineColor("red")).toEqual({ bcdsColor: "danger" });
    expect(mapMantineColor("blue").inlineColor).toBe(
      "var(--typography-color-link)",
    );
  });

  it("maps Title order to heading level", () => {
    expect(mapMantineTitleOrder(2)).toBe(2);
    expect(mapMantineTitleOrder(undefined)).toBe(1);
  });
});

describe("Text adapter", () => {
  beforeEach(() => {
    mockBcdsText.mockClear();
    mockBcdsHeading.mockClear();
  });

  it("renders with mapped size and color", () => {
    render(
      <Text size="sm" c="dimmed">
        Label
      </Text>,
    );
    expect(screen.getByText("Label")).toBeInTheDocument();
    expect(mockBcdsText).toHaveBeenCalledWith(
      expect.objectContaining({
        size: "small",
        color: "secondary",
      }),
    );
  });

  it("omits undefined className", () => {
    render(<Text>Body</Text>);
    const props = mockBcdsText.mock.calls[0]?.[0] as { className?: string };
    expect(props.className).toBeUndefined();
  });

  it("maps span prop to elementType", () => {
    render(
      <Text span c="red">
        Required
      </Text>,
    );
    expect(mockBcdsText).toHaveBeenCalledWith(
      expect.objectContaining({
        elementType: "span",
        color: "danger",
      }),
    );
  });

  it("applies font weight via style", () => {
    render(<Text fw={600}>Bold</Text>);
    const props = mockBcdsText.mock.calls[0]?.[0] as {
      style?: CSSProperties;
    };
    expect(props.style?.fontWeight).toBe(600);
  });
});

describe("Title adapter", () => {
  beforeEach(() => {
    mockBcdsHeading.mockClear();
  });

  it("maps order to heading level", () => {
    render(<Title order={3}>Section</Title>);
    expect(screen.getByTestId("bcds-heading")).toHaveAttribute(
      "data-level",
      "3",
    );
  });

  it("passes slot through to BC DS Heading", () => {
    render(
      <Title order={5} slot="title">
        Modal title
      </Title>,
    );
    expect(mockBcdsHeading).toHaveBeenCalledWith(
      expect.objectContaining({ slot: "title", children: "Modal title" }),
    );
  });
});
