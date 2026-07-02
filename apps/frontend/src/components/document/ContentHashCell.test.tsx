import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MantineProvider } from "../../ui";
import { ContentHashCell } from "./ContentHashCell";

const FULL_HASH =
  "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

function renderHash(hash: string | null | undefined) {
  return render(
    <MantineProvider>
      <ContentHashCell hash={hash} />
    </MantineProvider>,
  );
}

describe("ContentHashCell", () => {
  it("renders a dash when hash is missing", () => {
    renderHash(null);
    expect(screen.getByTestId("content-hash-empty")).toHaveTextContent("—");
  });

  it("shows a truncated hash by default", () => {
    renderHash(FULL_HASH);
    expect(screen.getByTestId("content-hash-value")).toHaveTextContent(
      "2cf24dba…9824",
    );
  });

  it("expands to the full hash on click", () => {
    renderHash(FULL_HASH);

    fireEvent.click(screen.getByTestId("content-hash-toggle"));

    expect(screen.getByTestId("content-hash-value")).toHaveTextContent(
      FULL_HASH,
    );
    expect(screen.getByTestId("content-hash-copy")).toBeInTheDocument();
  });
});
