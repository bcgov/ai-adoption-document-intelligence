import {
  AUTO_CTX_KEY_PREFIX,
  isAutoCtxKey,
  synthesiseCtxKey,
} from "./synthesise-ctx-key";

describe("synthesiseCtxKey", () => {
  it("uses the reserved prefix + nodeId + portName", () => {
    expect(synthesiseCtxKey("node-abc", "segments")).toBe(
      "__auto.node-abc.segments",
    );
  });

  it("exposes the prefix as a constant", () => {
    expect(AUTO_CTX_KEY_PREFIX).toBe("__auto.");
  });

  it("isAutoCtxKey identifies auto-synthesised keys", () => {
    expect(isAutoCtxKey("__auto.node-abc.segments")).toBe(true);
    expect(isAutoCtxKey("preparedData")).toBe(false);
    expect(isAutoCtxKey("doc.metadata")).toBe(false);
    expect(isAutoCtxKey("")).toBe(false);
  });
});
