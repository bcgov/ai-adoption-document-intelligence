import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MantineProvider } from "../../../../ui";
import { FlagNoteModal } from "./FlagNoteModal";

function renderModal(props: {
  activeFlagCount?: number;
  onConfirm?: () => void;
}) {
  const onClose = vi.fn();
  const onConfirm = props.onConfirm ?? vi.fn();
  render(
    <MantineProvider>
      <FlagNoteModal
        opened
        activeFlagCount={props.activeFlagCount ?? 0}
        isSubmitting={false}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    </MantineProvider>,
  );
  return { onClose, onConfirm };
}

describe("FlagNoteModal", () => {
  it("always opens blank, since flagging adds a new flag rather than editing one", () => {
    renderModal({ activeFlagCount: 2 });

    expect(
      screen.getByRole("textbox", {
        name: "What should the next reviewer know?",
      }),
    ).toHaveValue("");
  });

  it("tells the reviewer how many active flags already exist on the document", () => {
    renderModal({ activeFlagCount: 2 });

    expect(screen.getByText(/already has 2 active flags/i)).toBeInTheDocument();
  });

  it("confirms with the note that was typed", () => {
    const { onConfirm } = renderModal({});

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Date is ambiguous; signature missing too" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add flag" }));

    expect(onConfirm).toHaveBeenCalledWith(
      "Date is ambiguous; signature missing too",
    );
  });

  it("closes without flagging on Cancel", () => {
    const { onClose, onConfirm } = renderModal({});

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
