/**
 * Tests for executeTransformNode activity — US-009 Unresolved Binding Error Handling
 *
 * Verifies that the transform node activity propagates binding errors as
 * non-retryable ApplicationFailures so that Temporal halts the workflow and
 * records the failure in the execution history.
 */

import { ApplicationFailure } from "@temporalio/activity";
import {
  ExecuteTransformNodeParams,
  executeTransformNode,
} from "../activities/data-transform/execute";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds minimal ExecuteTransformNodeParams for unit testing.
 */
function buildParams(
  overrides: Partial<ExecuteTransformNodeParams> = {},
): ExecuteTransformNodeParams {
  return {
    inputFormat: "json",
    outputFormat: "json",
    fieldMapping: JSON.stringify({ field: "{{upstream.value}}" }),
    rawInputContext: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: Unresolved binding halts the workflow
// ---------------------------------------------------------------------------
describe("executeTransformNode activity — unresolved binding halts workflow", () => {
  it("throws ApplicationFailure when a binding path does not exist in the upstream output", async () => {
    const params = buildParams({
      fieldMapping: JSON.stringify({
        name: "{{extractionNode.MissingField}}",
      }),
      rawInputContext: {
        extractionNode: JSON.stringify({ FirstName: "Alice" }),
      },
    });

    await expect(executeTransformNode(params)).rejects.toBeInstanceOf(
      ApplicationFailure,
    );
  });

  it("throws a non-retryable ApplicationFailure", async () => {
    const params = buildParams({
      fieldMapping: JSON.stringify({
        name: "{{extractionNode.MissingField}}",
      }),
      rawInputContext: {
        extractionNode: JSON.stringify({ FirstName: "Alice" }),
      },
    });

    let caught: unknown;
    try {
      await executeTransformNode(params);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApplicationFailure);
    const failure = caught as ApplicationFailure;
    expect(failure.nonRetryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Error message identifies the unresolved binding path
// ---------------------------------------------------------------------------
describe("executeTransformNode activity — error message includes the unresolved path", () => {
  it("includes the full unresolved binding path in the ApplicationFailure message", async () => {
    const params = buildParams({
      fieldMapping: JSON.stringify({
        name: "{{extractionNode.MissingField}}",
      }),
      rawInputContext: {
        extractionNode: JSON.stringify({ FirstName: "Alice" }),
      },
    });

    let caught: unknown;
    try {
      await executeTransformNode(params);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApplicationFailure);
    const failure = caught as ApplicationFailure;
    expect(failure.message).toContain("extractionNode.MissingField");
  });

  it("sets the failure type to TRANSFORM_BINDING_ERROR", async () => {
    const params = buildParams({
      fieldMapping: JSON.stringify({
        name: "{{extractionNode.MissingField}}",
      }),
      rawInputContext: {
        extractionNode: JSON.stringify({ FirstName: "Alice" }),
      },
    });

    let caught: unknown;
    try {
      await executeTransformNode(params);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApplicationFailure);
    const failure = caught as ApplicationFailure;
    expect(failure.type).toBe("TRANSFORM_BINDING_ERROR");
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Successful execution returns rendered output
// ---------------------------------------------------------------------------
describe("executeTransformNode activity — successful execution", () => {
  it("resolves bindings and returns rendered JSON output", async () => {
    const params = buildParams({
      inputFormat: "json",
      outputFormat: "json",
      fieldMapping: JSON.stringify({ FirstName: "{{upstream.FirstName}}" }),
      rawInputContext: {
        upstream: JSON.stringify({ FirstName: "Alice" }),
      },
    });

    const result = await executeTransformNode(params);

    expect(result.output).toBe(JSON.stringify({ FirstName: "Alice" }));
  });

  it("does not throw when all bindings resolve successfully", async () => {
    const params = buildParams({
      inputFormat: "json",
      outputFormat: "json",
      fieldMapping: JSON.stringify({ value: "{{src.count}}" }),
      rawInputContext: {
        src: JSON.stringify({ count: 42 }),
      },
    });

    await expect(executeTransformNode(params)).resolves.not.toThrow();
  });

  it("passes non-string input context values through without parsing", async () => {
    const params = buildParams({
      inputFormat: "json",
      outputFormat: "json",
      fieldMapping: JSON.stringify({ name: "{{node.name}}" }),
      rawInputContext: {
        node: { name: "Alice" },
      },
    });

    const result = await executeTransformNode(params);

    expect(result.output).toBe(JSON.stringify({ name: "Alice" }));
  });
});
