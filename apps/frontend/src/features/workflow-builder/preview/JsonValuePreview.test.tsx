import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { JsonValuePreview } from "./JsonValuePreview";

const wrap = (v: unknown) =>
  render(
    <MantineProvider>
      <JsonValuePreview value={v} />
    </MantineProvider>,
  );

describe("JsonValuePreview", () => {
  it("renders a short primitive inline", () => {
    wrap("hello");
    expect(screen.getByTestId("json-value-preview")).toHaveTextContent("hello");
    expect(screen.queryByTestId("json-value-preview-raw")).toBeNull();
  });

  it("truncates a long string and offers View raw", () => {
    const long = "x".repeat(200);
    wrap(long);
    expect(screen.getByTestId("json-value-preview")).toHaveTextContent("…");
    expect(screen.getByTestId("json-value-preview-raw")).toBeInTheDocument();
  });

  it("shows an object snippet and opens the raw modal with pretty JSON", async () => {
    const user = userEvent.setup();
    wrap({ text: "INVOICE #4471", pages: 3 });
    await user.click(screen.getByTestId("json-value-preview-raw"));
    // The raw modal shows pretty-printed JSON with newlines + indentation;
    // pass an identity normalizer so the multi-line value isn't collapsed
    // to single spaces before matching.
    const raw = await screen.findByDisplayValue(
      JSON.stringify({ text: "INVOICE #4471", pages: 3 }, null, 2),
      { normalizer: (s) => s },
    );
    expect(raw).toBeInTheDocument();
  });
});
