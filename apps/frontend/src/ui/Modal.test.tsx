import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBcdsModal, mockBcdsDialog, mockBcdsHeading } = vi.hoisted(() => ({
  mockBcdsModal: vi.fn(
    ({
      children,
      isDismissable,
      isKeyboardDismissDisabled,
      className,
    }: {
      children: ReactNode;
      isDismissable?: boolean;
      isKeyboardDismissDisabled?: boolean;
      className?: string;
    }) => (
      <div
        data-testid="bcds-modal"
        data-dismissable={String(isDismissable ?? false)}
        data-keyboard-dismiss-disabled={String(
          isKeyboardDismissDisabled ?? false,
        )}
        className={className}
      >
        {children}
      </div>
    ),
  ),
  mockBcdsDialog: vi.fn(
    ({
      children,
      "aria-label": ariaLabel,
    }: {
      children: ReactNode;
      "aria-label"?: string;
    }) => (
      <div data-testid="bcds-dialog" aria-label={ariaLabel}>
        {children}
      </div>
    ),
  ),
  mockBcdsHeading: vi.fn(
    ({ children, slot }: { children: ReactNode; slot?: string }) => (
      <h2 data-slot={slot}>{children}</h2>
    ),
  ),
}));

vi.mock("@bcgov/design-system-react-components", () => ({
  Modal: (props: Parameters<typeof mockBcdsModal>[0]) => mockBcdsModal(props),
  Dialog: (props: Parameters<typeof mockBcdsDialog>[0]) =>
    mockBcdsDialog(props),
  Heading: (props: Parameters<typeof mockBcdsHeading>[0]) =>
    mockBcdsHeading(props),
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

import { Modal } from "./Modal";

describe("Modal", () => {
  beforeEach(() => {
    mockBcdsModal.mockClear();
    mockBcdsDialog.mockClear();
    mockBcdsHeading.mockClear();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <Modal opened={false} onClose={() => undefined}>
        Content
      </Modal>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(mockBcdsModal).not.toHaveBeenCalled();
  });

  it("disables keyboard dismiss when closeOnEscape is false", () => {
    render(
      <Modal
        opened
        onClose={() => undefined}
        closeOnEscape={false}
        title="Test"
      >
        Content
      </Modal>,
    );

    expect(mockBcdsModal).toHaveBeenCalledWith(
      expect.objectContaining({
        isKeyboardDismissDisabled: true,
      }),
    );
  });

  it("allows keyboard dismiss by default and when closeOnEscape is true", () => {
    render(
      <Modal opened onClose={() => undefined} title="Test">
        Content
      </Modal>,
    );

    expect(mockBcdsModal).toHaveBeenCalledWith(
      expect.objectContaining({
        isKeyboardDismissDisabled: false,
      }),
    );

    mockBcdsModal.mockClear();

    render(
      <Modal opened onClose={() => undefined} closeOnEscape={true} title="Test">
        Content
      </Modal>,
    );

    expect(mockBcdsModal).toHaveBeenCalledWith(
      expect.objectContaining({
        isKeyboardDismissDisabled: false,
      }),
    );
  });

  it("disables outside dismiss when closeOnClickOutside is false", () => {
    render(
      <Modal
        opened
        onClose={() => undefined}
        closeOnClickOutside={false}
        title="Test"
      >
        Content
      </Modal>,
    );

    expect(mockBcdsModal).toHaveBeenCalledWith(
      expect.objectContaining({
        isDismissable: false,
      }),
    );
  });

  it("adds centered class when centered is true", () => {
    render(
      <Modal opened onClose={() => undefined} centered title="Test">
        Content
      </Modal>,
    );

    expect(mockBcdsModal).toHaveBeenCalledWith(
      expect.objectContaining({
        className: expect.stringContaining("bcds-modal--centered"),
      }),
    );
  });

  it("omits centered class when centered is not set", () => {
    render(
      <Modal opened onClose={() => undefined} title="Test">
        Content
      </Modal>,
    );

    const { className } = mockBcdsModal.mock.calls[0][0] as {
      className: string;
    };
    expect(className).not.toContain("bcds-modal--centered");
  });

  it("passes slot title to Heading for dialog accessibility", () => {
    render(
      <Modal opened onClose={() => undefined} title="Delete item">
        Content
      </Modal>,
    );

    expect(mockBcdsHeading).toHaveBeenCalledWith(
      expect.objectContaining({
        slot: "title",
        children: "Delete item",
      }),
    );
  });

  it("passes aria-label to Dialog when no title is provided", () => {
    render(
      <Modal opened onClose={() => undefined} aria-label="Confirm action">
        Content
      </Modal>,
    );

    expect(mockBcdsDialog).toHaveBeenCalledWith(
      expect.objectContaining({ "aria-label": "Confirm action" }),
    );
  });
});
