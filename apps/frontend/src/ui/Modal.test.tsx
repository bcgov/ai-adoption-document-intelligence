import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBcdsModal, mockBcdsDialog } = vi.hoisted(() => ({
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
  mockBcdsDialog: vi.fn(({ children }: { children: ReactNode }) => (
    <div data-testid="bcds-dialog">{children}</div>
  )),
}));

vi.mock("@bcgov/design-system-react-components", () => ({
  Modal: (props: Parameters<typeof mockBcdsModal>[0]) => mockBcdsModal(props),
  Dialog: (props: Parameters<typeof mockBcdsDialog>[0]) =>
    mockBcdsDialog(props),
  Heading: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

import { Modal } from "./Modal";

describe("Modal", () => {
  beforeEach(() => {
    mockBcdsModal.mockClear();
    mockBcdsDialog.mockClear();
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
});
