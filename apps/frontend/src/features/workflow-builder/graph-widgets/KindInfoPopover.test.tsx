/**
 * The kind popover's sentence about a kind with no fields: a family only when
 * other kinds descend from it, otherwise a single kind with no members.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KindInfoPopover } from "./KindInfoPopover";

async function openPopover(kind: string): Promise<HTMLElement> {
  render(
    <MantineProvider>
      <KindInfoPopover kind={kind} />
    </MantineProvider>,
  );
  fireEvent.click(screen.getByTestId("kind-info-trigger"));
  return screen.findByTestId("kind-info-dropdown");
}

describe("KindInfoPopover", () => {
  it("says a kind with no fields and no members is one kind, not a family", async () => {
    const dropdown = await openPopover("DocumentId");
    expect(screen.getByTestId("kind-info-leaf")).toHaveTextContent(
      "Document ID has no fields listed: the kind registry names it but does not describe its contents. It has no members either — no other kind is a kind of Document ID.",
    );
    expect(dropdown).not.toHaveTextContent("whole family");
    expect(screen.queryByTestId("kind-info-wildcard")).toBeNull();
    // The ancestry line still places it.
    expect(screen.getByTestId("kind-info-ancestry")).toHaveTextContent(
      "A kind of Identifier, which is a kind of Artifact.",
    );
  });

  it("keeps the family sentence for a kind other kinds descend from", async () => {
    await openPopover("Identifier");
    expect(screen.getByTestId("kind-info-wildcard")).toHaveTextContent(
      "stands for a whole family",
    );
    expect(screen.queryByTestId("kind-info-leaf")).toBeNull();
  });

  it("lists the fields of a kind that has a schema, with no family or leaf sentence", async () => {
    await openPopover("PreparedFile");
    expect(screen.getByTestId("kind-info-fields")).toHaveTextContent(
      "fileName",
    );
    expect(screen.queryByTestId("kind-info-wildcard")).toBeNull();
    expect(screen.queryByTestId("kind-info-leaf")).toBeNull();
  });
});
