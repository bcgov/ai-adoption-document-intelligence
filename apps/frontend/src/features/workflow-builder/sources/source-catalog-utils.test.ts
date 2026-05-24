/**
 * Smoke tests for `source-catalog-utils.ts` (US-118 Scenario 1 + 5).
 *
 * Verifies the resolver pattern matches the activity-catalog one:
 *   - Known hint strings resolve to real components / tokens.
 *   - Unknown / missing hints return `undefined`.
 *   - `getSourceVisualHints` falls back to a neutral gray + database
 *     icon for unregistered subtypes (mirrors `getActivityVisualHints`'
 *     unknown-entry path).
 */

import {
  IconCloudUpload,
  IconDatabase,
  IconFileUpload,
  IconWorld,
} from "@tabler/icons-react";
import { describe, expect, it } from "vitest";

import {
  getSourceVisualHints,
  resolveSourceColor,
  resolveSourceIcon,
} from "./source-catalog-utils";

describe("resolveSourceIcon", () => {
  it("returns IconCloudUpload for the 'cloud-upload' hint (source.api)", () => {
    expect(resolveSourceIcon("cloud-upload")).toBe(IconCloudUpload);
  });

  it("returns IconFileUpload for the 'file-upload' hint (source.upload)", () => {
    expect(resolveSourceIcon("file-upload")).toBe(IconFileUpload);
  });

  it("returns IconWorld for the 'world' hint (reserved for future pull sources)", () => {
    expect(resolveSourceIcon("world")).toBe(IconWorld);
  });

  it("returns IconDatabase for the 'database' hint", () => {
    expect(resolveSourceIcon("database")).toBe(IconDatabase);
  });

  it("returns undefined for an unknown hint", () => {
    expect(resolveSourceIcon("never-seen-this-hint")).toBeUndefined();
  });

  it("returns undefined when the hint is undefined", () => {
    expect(resolveSourceIcon(undefined)).toBeUndefined();
  });

  it("returns undefined for the empty string", () => {
    expect(resolveSourceIcon("")).toBeUndefined();
  });
});

describe("resolveSourceColor", () => {
  it("resolves the 'indigo' hint to its hex token (source.api accent)", () => {
    expect(resolveSourceColor("indigo")).toBe("#6366f1");
  });

  it("resolves the 'blue' hint to its hex token (source.upload accent)", () => {
    expect(resolveSourceColor("blue")).toBe("#3b82f6");
  });

  it("returns undefined for an unknown hint", () => {
    expect(resolveSourceColor("never-seen-this-color")).toBeUndefined();
  });

  it("returns undefined when the hint is undefined", () => {
    expect(resolveSourceColor(undefined)).toBeUndefined();
  });
});

describe("getSourceVisualHints", () => {
  it("returns the catalog displayName + icon + colour for source.api", () => {
    const hints = getSourceVisualHints("source.api");
    expect(hints.displayName).toBe("API endpoint");
    expect(hints.Icon).toBe(IconCloudUpload);
    expect(hints.color).toBe("#6366f1");
    expect(hints.colorHint).toBe("indigo");
  });

  it("returns the catalog displayName + icon + colour for source.upload", () => {
    const hints = getSourceVisualHints("source.upload");
    expect(hints.displayName).toBe("File upload");
    expect(hints.Icon).toBe(IconFileUpload);
    expect(hints.color).toBe("#3b82f6");
    expect(hints.colorHint).toBe("blue");
  });

  it("falls back to gray + IconDatabase for an unregistered subtype", () => {
    const hints = getSourceVisualHints("source.does-not-exist");
    expect(hints.displayName).toBe("source.does-not-exist");
    expect(hints.Icon).toBe(IconDatabase);
    expect(hints.color).toBe("#6b7280");
    expect(hints.colorHint).toBeUndefined();
    expect(hints.description).toBe("Unregistered source subtype.");
  });
});
