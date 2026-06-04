import { fireEvent, render, screen } from "@testing-library/react";
import type { MouseEventHandler, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBcdsButton, mockBcdsLink } = vi.hoisted(() => ({
  mockBcdsButton: vi.fn(
    ({
      children,
      danger,
      isPending,
      ...props
    }: {
      children: ReactNode;
      danger?: boolean;
      isPending?: boolean;
      onClick?: MouseEventHandler<HTMLButtonElement>;
    }) => (
      <button
        type="button"
        data-danger={danger ? "true" : "false"}
        data-pending={isPending ? "true" : "false"}
        onClick={props.onClick}
      >
        {children}
      </button>
    ),
  ),
  mockBcdsLink: vi.fn(
    ({ children, href }: { children: ReactNode; href?: string }) => {
      const safeHref =
        href != null &&
        href.length > 0 &&
        ((href.startsWith("/") && !href.startsWith("//")) ||
          href.startsWith("#"))
          ? href
          : "#";
      return <a href={safeHref}>{children}</a>;
    },
  ),
}));

vi.mock("@bcgov/design-system-react-components", () => ({
  Button: (props: Parameters<typeof mockBcdsButton>[0]) =>
    mockBcdsButton(props),
  Link: (props: Parameters<typeof mockBcdsLink>[0]) => mockBcdsLink(props),
}));

import { Button, mapMantineVariantToBcds } from "./Button";

describe("mapMantineVariantToBcds", () => {
  it("maps Mantine hierarchy to BC DS variants", () => {
    expect(mapMantineVariantToBcds("filled")).toBe("primary");
    expect(mapMantineVariantToBcds("outline")).toBe("secondary");
    expect(mapMantineVariantToBcds("light")).toBe("secondary");
    expect(mapMantineVariantToBcds("subtle")).toBe("tertiary");
    expect(mapMantineVariantToBcds("link")).toBe("link");
  });
});

describe("Button adapter", () => {
  beforeEach(() => {
    mockBcdsButton.mockClear();
    mockBcdsLink.mockClear();
  });

  it("renders children and leftSection", () => {
    render(
      <Button leftSection={<span data-testid="icon">+</span>}>Save</Button>,
    );
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("omits undefined className so BC DS variant classes are not wiped", () => {
    render(<Button>Save</Button>);
    const props = mockBcdsButton.mock.calls[0]?.[0] as { className?: string };
    expect(props.className).toBeUndefined();
  });

  it("forwards className when provided", () => {
    render(<Button className="custom-class">Save</Button>);
    expect(mockBcdsButton).toHaveBeenCalledWith(
      expect.objectContaining({ className: "custom-class" }),
    );
  });

  it("maps loading to isPending", () => {
    render(<Button loading>Submit</Button>);
    expect(mockBcdsButton).toHaveBeenCalledWith(
      expect.objectContaining({ isPending: true }),
    );
  });

  it("maps color red to danger", () => {
    render(
      <Button color="red" variant="filled">
        Delete
      </Button>,
    );
    expect(mockBcdsButton).toHaveBeenCalledWith(
      expect.objectContaining({ danger: true, variant: "primary" }),
    );
  });

  it("maps subtle variant to tertiary", () => {
    render(<Button variant="subtle">Cancel</Button>);
    expect(mockBcdsButton).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "tertiary" }),
    );
  });

  it("sets isIconButton for icon-only actions", () => {
    render(
      <Button
        aria-label="Close"
        leftSection={<span data-testid="icon">×</span>}
      />,
    );
    expect(mockBcdsButton).toHaveBeenCalledWith(
      expect.objectContaining({ isIconButton: true }),
    );
  });

  it("supports onClick with stopPropagation for nested click targets", () => {
    const rowClick = vi.fn();
    const buttonClick = vi.fn();

    render(
      <div role="row" onClick={rowClick}>
        <Button
          onClick={(event) => {
            event.stopPropagation();
            buttonClick();
          }}
        >
          Join
        </Button>
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: /join/i }));
    expect(buttonClick).toHaveBeenCalledTimes(1);
    expect(rowClick).not.toHaveBeenCalled();
  });

  it("applies fullWidth style", () => {
    render(<Button fullWidth>Wide</Button>);
    expect(mockBcdsButton).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ width: "100%" }),
      }),
    );
  });

  it("renders anchor-style buttons with BC DS Link", () => {
    render(
      <Button component="a" href="/runs" variant="light">
        Runs
      </Button>,
    );
    expect(mockBcdsLink).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "/runs",
        isButton: true,
        buttonVariant: "secondary",
      }),
    );
    expect(mockBcdsButton).not.toHaveBeenCalled();
  });
});
