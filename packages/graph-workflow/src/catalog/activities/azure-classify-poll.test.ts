import { getActivityCatalogEntry } from "../index";

/**
 * Pins azureClassify.poll's ports to what the runtime activity
 * (apps/temporal/src/activities/azure-classify-poll.ts) actually reads and
 * returns. The engine passes inputs by port name, so a catalog port named
 * differently from the runtime field is silently never bound.
 *
 * In particular, the classifier-name input is `constructedClassifierName`
 * (the full `{groupId}__{classifierName}` produced by azureClassify.submit)
 * with kind `Artifact` — matching submit's output port of the same name so
 * the submit→poll chain auto-wires by name, and so the kind ACCEPTS what
 * submit produces (an `Artifact` output is not assignable to a `ModelId`
 * input).
 */
describe("azureClassify.poll catalog ports", () => {
  const entry = getActivityCatalogEntry("azureClassify.poll");

  it("is registered", () => {
    expect(entry).toBeDefined();
  });

  it("declares the runtime's input ports by name and kind", () => {
    expect(
      entry?.inputs.map(({ name, required, kind }) => ({
        name,
        required,
        kind,
      })),
    ).toEqual([
      { name: "resultId", required: true, kind: "Artifact" },
      { name: "constructedClassifierName", required: true, kind: "Artifact" },
      { name: "blobKey", required: false, kind: "DocumentRef" },
      { name: "groupId", required: false, kind: "GroupId" },
      { name: "documentId", required: false, kind: "DocumentId" },
    ]);
  });

  it("does not declare the retired modelId port", () => {
    expect(entry?.inputs.some((p) => p.name === "modelId")).toBe(false);
  });

  it("declares the runtime's output ports by name and kind", () => {
    expect(
      entry?.outputs.map(({ name, required, kind }) => ({
        name,
        required,
        kind,
      })),
    ).toEqual([
      { name: "labeledDocuments", required: true, kind: "LabeledDocumentMap" },
      { name: "originalBlobKey", required: true, kind: "DocumentRef" },
      { name: "groupId", required: true, kind: "GroupId" },
      { name: "documentId", required: false, kind: "DocumentId" },
    ]);
  });
});
