/**
 * Tests for `SignaturePreviewPane` (Phase 6 US-178).
 *
 * Pure-presentation card — no fetching, no mutations. Tests assert the
 * five sub-blocks (header, inputs, outputs, parameters, allowNet) +
 * the null-signature placeholder.
 */

import "@testing-library/jest-dom";

import type { DynamicNodeSignature } from "@ai-di/graph-workflow";
import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SignaturePreviewPane } from "./SignaturePreviewPane";
import {
  KIND_COLOR_TOKENS,
  resolveKindColor,
} from "./signature-preview-helpers";

function fullSignature(): DynamicNodeSignature {
  return {
    name: "my-custom-node",
    description: "Custom dynamic node",
    category: "Custom",
    deterministic: true,
    inputs: [
      { name: "document", kind: "Document", required: true },
      { name: "opts", kind: "Artifact" },
    ],
    outputs: [{ name: "result", kind: "OcrTable[]" }],
    paramsSchema: {
      type: "object",
      properties: {
        threshold: { type: "number" },
      },
      additionalProperties: false,
    },
    allowNet: ["api.example.com", "cdn.example.com"],
    timeoutMs: 60_000,
    maxMemoryMB: 256,
  };
}

function renderWithMantine(sig: DynamicNodeSignature | null) {
  return render(
    <MantineProvider>
      <SignaturePreviewPane signature={sig} />
    </MantineProvider>,
  );
}

describe("SignaturePreviewPane (US-178)", () => {
  // -----------------------------------------------------------------------
  // Scenario 1 — null signature renders placeholder
  // -----------------------------------------------------------------------
  it("renders the placeholder when signature is null", () => {
    renderWithMantine(null);
    expect(
      screen.getByTestId("signature-preview-placeholder"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("signature-preview-card"),
    ).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Scenario 2 — header has name + description + DYN pill + deterministic badge
  // -----------------------------------------------------------------------
  it("renders the header with name, description, DYN pill, and deterministic flag", () => {
    renderWithMantine(fullSignature());
    expect(screen.getByText("my-custom-node")).toBeInTheDocument();
    expect(screen.getByText("Custom dynamic node")).toBeInTheDocument();
    expect(
      screen.getByTestId("signature-preview-dyn-pill"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("signature-preview-deterministic-badge"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("signature-preview-non-deterministic-badge"),
    ).not.toBeInTheDocument();
  });

  it("renders the non-deterministic badge when deterministic = false", () => {
    renderWithMantine({ ...fullSignature(), deterministic: false });
    expect(
      screen.getByTestId("signature-preview-non-deterministic-badge"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("signature-preview-deterministic-badge"),
    ).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Scenario 3 — inputs + outputs tables with kind dots + required badge
  // -----------------------------------------------------------------------
  it("renders inputs + outputs with kind-color dots and a `required` badge", () => {
    renderWithMantine(fullSignature());

    // Required input badge
    expect(
      screen.getByTestId("signature-preview-inputs-required-document"),
    ).toBeInTheDocument();

    // Optional input has no badge
    expect(
      screen.queryByTestId("signature-preview-inputs-required-opts"),
    ).not.toBeInTheDocument();

    // Kind dots use the Phase 3 palette tokens
    const docDot = screen.getByTestId("signature-preview-inputs-dot-document");
    expect(docDot.getAttribute("data-kind-color")).toBe(
      KIND_COLOR_TOKENS.Document,
    );
    const resultDot = screen.getByTestId(
      "signature-preview-outputs-dot-result",
    );
    // `OcrTable[]` strips to `OcrTable` for the colour lookup.
    expect(resultDot.getAttribute("data-kind-color")).toBe(
      KIND_COLOR_TOKENS.OcrTable,
    );
  });

  // -----------------------------------------------------------------------
  // Scenario 4 — paramsSchema with properties renders the read-only form
  // -----------------------------------------------------------------------
  it("renders the parameters block when paramsSchema has properties", () => {
    renderWithMantine(fullSignature());
    expect(screen.getByTestId("signature-preview-params")).toBeInTheDocument();
  });

  it("hides the parameters block when paramsSchema is empty", () => {
    renderWithMantine({
      ...fullSignature(),
      paramsSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    });
    expect(
      screen.queryByTestId("signature-preview-params"),
    ).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Scenario 5 — allowNet chips render when non-empty, hidden when empty
  // -----------------------------------------------------------------------
  it("renders allowNet chips when the array is non-empty", () => {
    renderWithMantine(fullSignature());
    expect(
      screen.getByTestId("signature-preview-allow-net"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("signature-preview-allow-net-api.example.com"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("signature-preview-allow-net-cdn.example.com"),
    ).toBeInTheDocument();
  });

  it("hides the allowNet section when the array is empty", () => {
    renderWithMantine({ ...fullSignature(), allowNet: [] });
    expect(
      screen.queryByTestId("signature-preview-allow-net"),
    ).not.toBeInTheDocument();
  });
});

describe("resolveKindColor (US-178 — Phase 3 palette dot helper)", () => {
  it("maps known scalar kinds to their Phase 3 token", () => {
    expect(resolveKindColor("Document")).toBe(KIND_COLOR_TOKENS.Document);
    expect(resolveKindColor("OcrTable")).toBe(KIND_COLOR_TOKENS.OcrTable);
  });

  it("treats `<Kind>[]` arrays as the scalar kind for color", () => {
    expect(resolveKindColor("Document[]")).toBe(KIND_COLOR_TOKENS.Document);
  });

  it("falls back to gray for unknown kinds", () => {
    expect(resolveKindColor("UnknownKind")).toBe("#6b7280");
  });
});
