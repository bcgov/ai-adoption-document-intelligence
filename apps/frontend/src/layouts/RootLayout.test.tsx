/**
 * Tests for RootLayout route predicates that drive the AppShell.Main
 * layout branch (padded / full-viewport workspace / full-bleed editor).
 *
 * The visual wiring (class names on AppShell.Main, outlet height) is verified
 * live; here we lock the routing logic and — critically — that the workspace
 * and editor predicates are mutually exclusive, since they select competing
 * full-height branches.
 */

import { describe, expect, it } from "vitest";
import { isEditorRoute, isWorkspaceRoute } from "./RootLayout";

describe("isEditorRoute", () => {
  it("matches the create route", () => {
    expect(isEditorRoute("/workflows/create")).toBe(true);
  });

  it("matches the canonical edit route", () => {
    expect(isEditorRoute("/workflows/abc123/edit")).toBe(true);
    expect(isEditorRoute("/workflows/some-lineage-id/edit")).toBe(true);
  });

  it("does NOT match the workflows list route", () => {
    expect(isEditorRoute("/workflows")).toBe(false);
  });

  it("does NOT match the by-slug redirect route (extra segment)", () => {
    // This route only redirects to /workflows/:id/edit, so it must not be
    // treated as the editor itself.
    expect(isEditorRoute("/workflows/by-slug/my-slug/edit")).toBe(false);
  });

  it("does NOT match unrelated or partial paths", () => {
    expect(isEditorRoute("/documents")).toBe(false);
    expect(isEditorRoute("/workflows/create/extra")).toBe(false);
    expect(isEditorRoute("/workflows/abc123")).toBe(false);
    expect(isEditorRoute("/workflows/abc123/edit/steps")).toBe(false);
  });
});

describe("isWorkspaceRoute", () => {
  it("matches template-model, review and benchmarking-review routes", () => {
    expect(isWorkspaceRoute("/template-models/m1/document/d1")).toBe(true);
    expect(isWorkspaceRoute("/review/doc-1")).toBe(true);
    expect(
      isWorkspaceRoute("/benchmarking/datasets/ds1/versions/v1/review/doc-1"),
    ).toBe(true);
  });

  it("does NOT match editor routes", () => {
    expect(isWorkspaceRoute("/workflows/create")).toBe(false);
    expect(isWorkspaceRoute("/workflows/abc123/edit")).toBe(false);
  });
});

describe("workspace vs editor predicates are mutually exclusive", () => {
  const paths = [
    "/workflows/create",
    "/workflows/abc123/edit",
    "/workflows/by-slug/my-slug/edit",
    "/workflows",
    "/template-models/m1/document/d1",
    "/review/doc-1",
    "/benchmarking/datasets/ds1/versions/v1/review/doc-1",
    "/documents",
    "/",
  ];

  it("never classifies a path as both workspace and editor", () => {
    for (const path of paths) {
      expect(isWorkspaceRoute(path) && isEditorRoute(path)).toBe(false);
    }
  });
});
