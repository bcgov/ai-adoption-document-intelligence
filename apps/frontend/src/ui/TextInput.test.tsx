import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBcdsMocks } from "../test/mockBcdsComponents";
import { TextInput } from "./TextInput";

describe("TextInput adapter", () => {
  beforeEach(() => {
    getBcdsMocks().mockBcdsTextField.mockClear();
  });

  it("passes string labels to BC DS TextField", () => {
    render(<TextInput label="Name" value="Ada" onChange={() => undefined} />);
    expect(getBcdsMocks().mockBcdsTextField).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Name" }),
    );
  });

  it("derives aria-label from placeholder when unlabeled", () => {
    render(
      <TextInput placeholder="Search…" value="" onChange={() => undefined} />,
    );
    expect(getBcdsMocks().mockBcdsTextField).toHaveBeenCalledWith(
      expect.objectContaining({ "aria-label": "Search…" }),
    );
  });

  it("bridges BC DS onChange to Mantine-style events", () => {
    const onChange = vi.fn();
    render(<TextInput value="" onChange={onChange} placeholder="Name" />);
    fireEvent.change(screen.getByTestId("bcds-text-field"), {
      target: { value: "Bob" },
    });
    expect(onChange.mock.calls[0]?.[0].currentTarget.value).toBe("Bob");
  });
});
