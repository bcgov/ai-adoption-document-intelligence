import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MantineProvider } from "../../../../ui";
import { FlagNoteModal } from "./FlagNoteModal";

function renderModal(props: { initialNote?: string; onConfirm?: () => void }) {
  const onClose = vi.fn();
  const onConfirm = props.onConfirm ?? vi.fn();
  render(
    <MantineProvider>
      <FlagNoteModal
        opened
        initialNote={props.initialNote ?? ""}
        isSubmitting={false}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    </MantineProvider>,
  );
  return { onClose, onConfirm };
}

describe("FlagNoteModal", () => {
  it("opens with the note already on the session, so a second flag can build on it", () => {
    renderModal({ initialNote: "Date on page 1 is ambiguous" });

    expect(
      screen.getByRole("textbox", {
        name: "What should the next reviewer know?",
      }),
    ).toHaveValue("Date on page 1 is ambiguous");
  });

  it("confirms with the note as edited", () => {
    const { onConfirm } = renderModal({ initialNote: "Date is ambiguous" });

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Date is ambiguous; signature missing too" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Flag document" }));

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
