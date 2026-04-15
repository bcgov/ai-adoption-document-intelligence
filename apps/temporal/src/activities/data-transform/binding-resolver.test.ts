import { BindingResolutionError, resolveBindings } from "./binding-resolver";

// ---------------------------------------------------------------------------
// Scenario 1: Simple binding resolves to upstream value
// ---------------------------------------------------------------------------
describe("resolveBindings – simple binding", () => {
  it("resolves a top-level field from the named upstream node", () => {
    const mapping = { FirstName: "{{extractionNode.FirstName}}" };
    const context = { extractionNode: { FirstName: "Alice" } };

    const result = resolveBindings(mapping, context);

    expect(result).toEqual({ FirstName: "Alice" });
  });

  it("returns the original type when the whole value is a binding", () => {
    const mapping = { count: "{{statsNode.total}}" };
    const context = { statsNode: { total: 42 } };

    const result = resolveBindings(mapping, context);

    expect(result.count).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Deeply nested binding resolves through arbitrary depth
// ---------------------------------------------------------------------------
describe("resolveBindings – deeply nested binding", () => {
  it("resolves a three-level deep path", () => {
    const mapping = { userId: "{{extractionNode.payload.header.userId}}" };
    const context = {
      extractionNode: { payload: { header: { userId: "user-99" } } },
    };

    const result = resolveBindings(mapping, context);

    expect(result.userId).toBe("user-99");
  });

  it("resolves an arbitrarily deep path", () => {
    const mapping = { leaf: "{{a.b.c.d.e.f}}" };
    const context = { a: { b: { c: { d: { e: { f: "deep" } } } } } };

    const result = resolveBindings(mapping, context);

    expect(result.leaf).toBe("deep");
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Literal string values pass through unchanged
// ---------------------------------------------------------------------------
describe("resolveBindings – literal strings", () => {
  it("returns a literal string value unchanged", () => {
    const mapping = { TransactionName: "EA SD81 Submission" };
    const context = {};

    const result = resolveBindings(mapping, context);

    expect(result.TransactionName).toBe("EA SD81 Submission");
  });

  it("does not modify numeric or boolean non-string values", () => {
    const mapping = { active: true, count: 5 };
    const context = {};

    const result = resolveBindings(mapping, context);

    expect(result.active).toBe(true);
    expect(result.count).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Unresolved binding throws a structured error
// ---------------------------------------------------------------------------
describe("resolveBindings – unresolved binding throws structured error", () => {
  it("throws BindingResolutionError when the field does not exist", () => {
    const mapping = { name: "{{extractionNode.MissingField}}" };
    const context = { extractionNode: { FirstName: "Alice" } };

    expect(() => resolveBindings(mapping, context)).toThrow(
      BindingResolutionError,
    );
  });

  it("error message includes the full unresolved path", () => {
    const mapping = { name: "{{extractionNode.MissingField}}" };
    const context = { extractionNode: { FirstName: "Alice" } };

    expect(() => resolveBindings(mapping, context)).toThrow(
      "extractionNode.MissingField",
    );
  });

  it("throws when the node itself does not exist in context", () => {
    const mapping = { id: "{{missingNode.id}}" };
    const context = { extractionNode: { id: "123" } };

    expect(() => resolveBindings(mapping, context)).toThrow(
      BindingResolutionError,
    );
    expect(() => resolveBindings(mapping, context)).toThrow("missingNode.id");
  });

  it("BindingResolutionError exposes the path property", () => {
    const mapping = { id: "{{nodeA.missing}}" };
    const context = { nodeA: {} };

    try {
      resolveBindings(mapping, context);
      fail("expected error to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BindingResolutionError);
      expect((err as BindingResolutionError).path).toBe("nodeA.missing");
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Bindings can reference any prior node in the workflow
// ---------------------------------------------------------------------------
describe("resolveBindings – multi-node references", () => {
  it("resolves bindings from two different upstream nodes in the same mapping", () => {
    const mapping = {
      aValue: "{{nodeA.value}}",
      bValue: "{{nodeB.value}}",
    };
    const context = {
      nodeA: { value: "from-A" },
      nodeB: { value: "from-B" },
    };

    const result = resolveBindings(mapping, context);

    expect(result.aValue).toBe("from-A");
    expect(result.bValue).toBe("from-B");
  });

  it("resolves bindings from many upstream nodes simultaneously", () => {
    const mapping = {
      x: "{{node1.x}}",
      y: "{{node2.y}}",
      z: "{{node3.z}}",
    };
    const context = {
      node1: { x: 1 },
      node2: { y: 2 },
      node3: { z: 3 },
    };

    const result = resolveBindings(mapping, context);

    expect(result.x).toBe(1);
    expect(result.y).toBe(2);
    expect(result.z).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Additional: inline bindings mixed with literal text
// ---------------------------------------------------------------------------
describe("resolveBindings – inline bindings mixed with text", () => {
  it("interpolates a binding embedded in a larger string", () => {
    const mapping = { label: "Hello, {{extractionNode.name}}!" };
    const context = { extractionNode: { name: "Bob" } };

    const result = resolveBindings(mapping, context);

    expect(result.label).toBe("Hello, Bob!");
  });
});

// ---------------------------------------------------------------------------
// Additional: nested mapping objects are walked recursively
// ---------------------------------------------------------------------------
describe("resolveBindings – nested objects", () => {
  it("resolves bindings inside nested plain objects", () => {
    const mapping = {
      person: {
        first: "{{node.firstName}}",
        last: "{{node.lastName}}",
      },
    };
    const context = { node: { firstName: "Jane", lastName: "Doe" } };

    const result = resolveBindings(mapping, context);

    expect(result.person).toEqual({ first: "Jane", last: "Doe" });
  });
});
