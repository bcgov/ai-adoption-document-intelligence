/**
 * Tests for port constants (P-5, ruling R-3).
 *
 * The load-bearing claims are that a constant is a HIDDEN ctx declaration
 * carrying `defaultValue` (no new `PortBinding` variant), that its key can
 * never contain a dot (a dotted key is seeded flat by `initializeContext` and
 * read nested by `resolveCtxBinding`, so it would silently never resolve), and
 * that promotion is a rename plus `isInput` — which is exactly what makes the
 * value reach the run-spec.
 */
import { resolveCtxBinding } from "@ai-di/graph-workflow";
import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { autoWireIssuesToValidationErrors } from "../auto-wire-validation";
import {
  CONST_CTX_KEY_PREFIX,
  clearPortConstant,
  findPortConstantKey,
  getPortConstant,
  isConstCtxKey,
  isPromotableCtxKeyName,
  mintConstCtxKey,
  promotePortConstant,
  setPortConstant,
} from "./port-constants";

function prepareConfig(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "constants" },
    ctx: {},
    nodes: {
      "prep-1": {
        id: "prep-1",
        type: "activity",
        label: "Prepare File",
        activityType: "file.prepare",
        inputs: [],
        outputs: [],
        parameters: {},
      },
    },
    edges: [],
    entryNodeId: "prep-1",
  };
}

describe("isConstCtxKey", () => {
  it("matches minted constant keys and nothing else", () => {
    expect(isConstCtxKey(`${CONST_CTX_KEY_PREFIX}prep_1_fileType`)).toBe(true);
    expect(isConstCtxKey("__auto.prep_1.preparedData")).toBe(false);
    expect(isConstCtxKey("fileType")).toBe(false);
  });
});

describe("mintConstCtxKey", () => {
  it("never mints a key containing a dot", () => {
    const config = prepareConfig();
    // A node id with a dot is legal (`decodeAutoCtxKey` preserves them), and a
    // dotted CONSTANT key would be seeded flat and read nested — invisible at
    // runtime. Every unsafe character folds to `_`.
    const key = mintConstCtxKey(config, "a.b-c", "file.Type");
    expect(key).toBe("__const_a_b_c_file_Type");
    expect(key).not.toContain(".");
  });

  it("uniquifies when sanitising collapses two pairs onto one base", () => {
    const config = prepareConfig();
    config.ctx = { __const_a_b_c: { type: "string", defaultValue: "x" } };
    expect(mintConstCtxKey(config, "a-b", "c")).toBe("__const_a_b_c_2");
  });
});

describe("setPortConstant", () => {
  it("writes a hidden ctx declaration with defaultValue and binds the port to it", () => {
    const next = setPortConstant(
      prepareConfig(),
      "prep-1",
      "fileType",
      "image",
    );
    const ctxKey = findPortConstantKey(next, "prep-1", "fileType");
    expect(ctxKey).toBe("__const_prep_1_fileType");
    expect(next.ctx[ctxKey as string]).toEqual({
      type: "string",
      defaultValue: "image",
    });
    expect(next.nodes["prep-1"].inputs).toEqual([
      { port: "fileType", ctxKey: "__const_prep_1_fileType" },
    ]);
  });

  it("locks the port so the resolver cannot overwrite the constant", () => {
    const next = setPortConstant(
      prepareConfig(),
      "prep-1",
      "fileType",
      "image",
    );
    expect(next.nodes["prep-1"].metadata?.lockedInputPorts).toEqual([
      "fileType",
    ]);
  });

  it("adds no `value` field to the binding (the rejected PortBinding variant)", () => {
    const next = setPortConstant(
      prepareConfig(),
      "prep-1",
      "fileType",
      "image",
    );
    const binding = next.nodes["prep-1"].inputs?.[0];
    expect(Object.keys(binding ?? {}).sort()).toEqual(["ctxKey", "port"]);
  });

  it("reuses the same key when the value is edited", () => {
    const first = setPortConstant(
      prepareConfig(),
      "prep-1",
      "fileType",
      "image",
    );
    const second = setPortConstant(first, "prep-1", "fileType", "pdf");
    expect(Object.keys(second.ctx)).toEqual(["__const_prep_1_fileType"]);
    expect(getPortConstant(second, "prep-1", "fileType")).toBe("pdf");
  });

  it("treats an empty value as a clear", () => {
    const set = setPortConstant(prepareConfig(), "prep-1", "fileType", "image");
    const cleared = setPortConstant(set, "prep-1", "fileType", "   ");
    expect(cleared.ctx).toEqual({});
    expect(cleared.nodes["prep-1"].inputs).toEqual([]);
  });

  it("returns the same config for an unknown node", () => {
    const config = prepareConfig();
    expect(setPortConstant(config, "nope", "fileType", "image")).toBe(config);
  });
});

describe("getPortConstant", () => {
  it("returns null for a port bound to a wire rather than a constant", () => {
    const config = prepareConfig();
    config.nodes["prep-1"].inputs = [
      { port: "blobKey", ctxKey: "__auto.up.documentUrl" },
    ];
    expect(getPortConstant(config, "prep-1", "blobKey")).toBeNull();
  });

  it("returns null when a hand-edited declaration holds a non-string", () => {
    const config = prepareConfig();
    config.ctx = {
      __const_prep_1_fileType: { type: "string", defaultValue: 3 },
    };
    config.nodes["prep-1"].inputs = [
      { port: "fileType", ctxKey: "__const_prep_1_fileType" },
    ];
    expect(getPortConstant(config, "prep-1", "fileType")).toBeNull();
  });
});

describe("clearPortConstant", () => {
  it("removes the binding, the lock and the hidden declaration", () => {
    const set = setPortConstant(prepareConfig(), "prep-1", "fileType", "image");
    const cleared = clearPortConstant(set, "prep-1", "fileType");
    expect(cleared.ctx).toEqual({});
    expect(cleared.nodes["prep-1"].inputs).toEqual([]);
    expect(cleared.nodes["prep-1"].metadata?.lockedInputPorts).toBeUndefined();
  });

  it("keeps other locks on the node intact", () => {
    const base = prepareConfig();
    base.nodes["prep-1"].metadata = { lockedInputPorts: ["blobKey"] };
    const set = setPortConstant(base, "prep-1", "fileType", "image");
    const cleared = clearPortConstant(set, "prep-1", "fileType");
    expect(cleared.nodes["prep-1"].metadata?.lockedInputPorts).toEqual([
      "blobKey",
    ]);
  });

  it("keeps the declaration when another port still reads the same key", () => {
    const set = setPortConstant(prepareConfig(), "prep-1", "fileType", "image");
    set.nodes["prep-1"].inputs = [
      ...(set.nodes["prep-1"].inputs ?? []),
      { port: "contentType", ctxKey: "__const_prep_1_fileType" },
    ];
    const cleared = clearPortConstant(set, "prep-1", "fileType");
    expect(cleared.ctx.__const_prep_1_fileType).toBeDefined();
  });

  it("returns the same config when the port holds no constant", () => {
    const config = prepareConfig();
    expect(clearPortConstant(config, "prep-1", "fileType")).toBe(config);
  });
});

/**
 * Badge / validation-drawer agreement.
 *
 * `autoWireIssuesToValidationErrors` is the ONE surface behind the top-bar
 * count, the per-node badge and the validation drawer, and it counts through
 * `computeNodeInputIssues` — a port filter of its own, not
 * `resolveWireableInputRows`. Surfacing optional identifier ports in the panel
 * therefore cannot move a count; typing a CONSTANT into one could, so it is
 * asserted from both ends.
 */
describe("validation agreement", () => {
  it("an optional identifier port with no constant is counted by nobody", () => {
    expect(autoWireIssuesToValidationErrors(prepareConfig())).toEqual([
      // Only the two REQUIRED ports report; the three optional ones do not.
      {
        path: "nodes.prep-1.inputs.documentId",
        message: expect.stringContaining("Document ID"),
        severity: "warning",
      },
      {
        path: "nodes.prep-1.inputs.blobKey",
        message: expect.stringContaining("File reference"),
        severity: "warning",
      },
    ]);
  });

  it("typing a constant adds no warning and removes none", () => {
    const before = autoWireIssuesToValidationErrors(prepareConfig());
    const after = autoWireIssuesToValidationErrors(
      setPortConstant(prepareConfig(), "prep-1", "fileType", "image"),
    );
    expect(after).toEqual(before);
  });

  it("a constant on a REQUIRED port satisfies it on the drawer's terms too", () => {
    const config = setPortConstant(
      prepareConfig(),
      "prep-1",
      "documentId",
      "doc-42",
    );
    const paths = autoWireIssuesToValidationErrors(config).map((e) => e.path);
    expect(paths).not.toContain("nodes.prep-1.inputs.documentId");
  });
});

/**
 * The half of the path that lives outside this package. `resolveCtxBinding` is
 * the REAL reader — `apps/temporal/src/graph-engine/context-utils.ts` exports
 * `resolvePortBinding` as a one-line delegation to it — and `seedLikeEngine`
 * mirrors the only other step a constant depends on, `initializeContext`'s
 *
 *     if (declaration.defaultValue !== undefined) { ctx[key] = declaration.defaultValue; }
 *
 * which assigns FLAT while the reader splits on dots. That asymmetry is the
 * whole reason the constant key scheme uses underscores, so it is asserted
 * rather than described.
 */
function seedLikeEngine(config: GraphWorkflowConfig): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};
  for (const [key, declaration] of Object.entries(config.ctx)) {
    if (declaration.defaultValue !== undefined) {
      ctx[key] = declaration.defaultValue;
    }
  }
  return ctx;
}

describe("engine path", () => {
  it("a minted constant reaches the port through seed + resolve", () => {
    const config = setPortConstant(
      prepareConfig(),
      "prep-1",
      "fileType",
      "image",
    );
    const binding = config.nodes["prep-1"].inputs?.[0];
    const ctx = seedLikeEngine(config);
    expect(resolveCtxBinding(binding?.ctxKey ?? "", ctx)).toBe("image");
  });

  it("a per-run initialCtx value overrides the constant, which is what makes promotion work", () => {
    const config = setPortConstant(
      prepareConfig(),
      "prep-1",
      "fileType",
      "image",
    );
    const promoted = promotePortConstant(
      config,
      "prep-1",
      "fileType",
      "fileType",
    );
    // `initializeContext` overlays `initialCtx` AFTER the declaration defaults.
    const ctx = { ...seedLikeEngine(promoted), fileType: "pdf" };
    expect(resolveCtxBinding("fileType", ctx)).toBe("pdf");
  });

  it("regression: a DOTTED constant key would be seeded flat and read as nothing", () => {
    const dotted: GraphWorkflowConfig = {
      ...prepareConfig(),
      ctx: {
        "__const.prep-1.fileType": { type: "string", defaultValue: "image" },
      },
    };
    const ctx = seedLikeEngine(dotted);
    expect(resolveCtxBinding("__const.prep-1.fileType", ctx)).toBeUndefined();
  });
});

describe("isPromotableCtxKeyName", () => {
  it("accepts ordinary identifiers and refuses the reserved prefixes", () => {
    expect(isPromotableCtxKeyName("fileType")).toBe(true);
    expect(isPromotableCtxKeyName("_fileType2")).toBe(true);
    expect(isPromotableCtxKeyName("2fileType")).toBe(false);
    expect(isPromotableCtxKeyName("file.Type")).toBe(false);
    expect(isPromotableCtxKeyName("")).toBe(false);
    expect(isPromotableCtxKeyName("__const_x")).toBe(false);
    expect(isPromotableCtxKeyName("__auto_x")).toBe(false);
  });
});

describe("promotePortConstant", () => {
  it("renames the hidden key, flags it isInput and keeps the value as the default", () => {
    const set = setPortConstant(prepareConfig(), "prep-1", "fileType", "image");
    const promoted = promotePortConstant(set, "prep-1", "fileType", "fileType");
    expect(promoted.ctx).toEqual({
      fileType: { type: "string", defaultValue: "image", isInput: true },
    });
    // The binding follows the rename, so the port keeps reading the same value.
    expect(promoted.nodes["prep-1"].inputs).toEqual([
      { port: "fileType", ctxKey: "fileType" },
    ]);
    expect(findPortConstantKey(promoted, "prep-1", "fileType")).toBeNull();
  });

  it("refuses a name that is already declared", () => {
    const set = setPortConstant(prepareConfig(), "prep-1", "fileType", "image");
    set.ctx.fileType = { type: "string" };
    expect(promotePortConstant(set, "prep-1", "fileType", "fileType")).toBe(
      set,
    );
  });

  it("refuses an unusable name and a port with no constant", () => {
    const set = setPortConstant(prepareConfig(), "prep-1", "fileType", "image");
    expect(promotePortConstant(set, "prep-1", "fileType", "file.Type")).toBe(
      set,
    );
    expect(promotePortConstant(set, "prep-1", "blobKey", "blob")).toBe(set);
  });
});
