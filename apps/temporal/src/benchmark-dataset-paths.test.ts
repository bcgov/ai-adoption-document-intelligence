import { joinDatasetPath } from "./benchmark-dataset-paths";

describe("joinDatasetPath", () => {
  it("joins a manifest-relative path onto the dataset directory", () => {
    expect(joinDatasetPath("/cache/g1/ds-v1", "inputs/a.pdf")).toBe(
      "/cache/g1/ds-v1/inputs/a.pdf",
    );
  });

  it("collapses repeated slashes", () => {
    expect(joinDatasetPath("/cache/g1/ds-v1/", "inputs//a.pdf")).toBe(
      "/cache/g1/ds-v1/inputs/a.pdf",
    );
  });

  it.each([
    "../ds-v2/inputs/a.pdf",
    "inputs/../../ds-v2/a.pdf",
    "inputs/..",
  ])("refuses a path with a parent segment: %s", (relativePath) => {
    expect(() => joinDatasetPath("/cache/g1/ds-v1", relativePath)).toThrow(
      /must stay inside the dataset/,
    );
  });

  it("refuses an absolute path", () => {
    expect(() => joinDatasetPath("/cache/g1/ds-v1", "/cache/g2/a.pdf")).toThrow(
      /must stay inside the dataset/,
    );
  });
});
