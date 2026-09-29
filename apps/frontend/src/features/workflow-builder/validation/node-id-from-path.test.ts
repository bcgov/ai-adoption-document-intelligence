import { describe, expect, it } from "vitest";
import { nodeIdFromPath } from "./useGraphValidation";

/**
 * G-096 — a node id containing a dot bucketed under a node that does not
 * exist. `nodeIdFromPath` split at the FIRST dot while its counterpart
 * `parseInputPortPath` (`/^nodes\.(.+)\.inputs\./`) is greedy, so the two
 * disagreed on exactly these paths: the drawer heading fell back to the raw
 * key and clicking the row selected nothing.
 *
 * Node ids are author/agent-supplied with no charset rule, so a dot is legal.
 */
describe("nodeIdFromPath (G-096)", () => {
  const ids = ["my.node", "plain", "a", "a.b"];

  it("resolves a dotted node id to the whole id, not its first segment", () => {
    expect(nodeIdFromPath("nodes.my.node.inputs.fileData", ids)).toBe(
      "my.node",
    );
  });

  it("resolves an undotted node id unchanged", () => {
    expect(nodeIdFromPath("nodes.plain.inputs.fileData", ids)).toBe("plain");
  });

  it("prefers the longest matching id when one is a prefix of another", () => {
    expect(nodeIdFromPath("nodes.a.b.inputs.x", ids)).toBe("a.b");
    expect(nodeIdFromPath("nodes.a.inputs.x", ids)).toBe("a");
  });

  it("matches a bare node anchor with no trailing segment", () => {
    expect(nodeIdFromPath("nodes.my.node", ids)).toBe("my.node");
  });

  it("returns null for a non-node anchor", () => {
    expect(nodeIdFromPath("edges[0].source", ids)).toBeNull();
    expect(nodeIdFromPath("metadata.ctx", ids)).toBeNull();
    expect(nodeIdFromPath("", ids)).toBeNull();
  });

  it("falls back to the positional split for a node that no longer exists", () => {
    // A stale anchor still belongs somewhere rather than vanishing.
    expect(nodeIdFromPath("nodes.deleted.inputs.x", ids)).toBe("deleted");
  });

  it("would have mis-bucketed before the fix", () => {
    // Documents the regression: with no id list to match against, the old
    // positional split yields "my" — a node that exists nowhere.
    expect(nodeIdFromPath("nodes.my.node.inputs.fileData", [])).toBe("my");
  });
});
