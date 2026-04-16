/**
 * Tests for executeTransformNode activity — US-010 Malformed Output Error Handling
 *
 * Verifies that the transform node activity throws a non-retryable
 * ApplicationFailure with type TRANSFORM_OUTPUT_ERROR when the rendered output
 * string is structurally invalid for the configured output format.
 */

import { ApplicationFailure } from "@temporalio/activity";
import {
  ExecuteTransformNodeParams,
  executeTransformNode,
} from "../activities/data-transform/execute";

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted by Jest)
// ---------------------------------------------------------------------------

// Mock the individual renderers so individual tests can inject malformed output.
// The default implementation returns an empty string; override per test.
jest.mock("../activities/data-transform/json-renderer", () => ({
  renderJson: jest.fn(() => ""),
}));

jest.mock("../activities/data-transform/csv-renderer", () => ({
  renderCsv: jest.fn(() => ""),
  CsvRenderError: class CsvRenderError extends Error {},
}));

import { renderCsv } from "../activities/data-transform/csv-renderer";
// Import after mock registration so we get the mocked versions.
import { renderJson } from "../activities/data-transform/json-renderer";

const renderJsonMock = renderJson as jest.MockedFunction<typeof renderJson>;
const renderCsvMock = renderCsv as jest.MockedFunction<typeof renderCsv>;

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
    fieldMapping: JSON.stringify({ field: "static value" }),
    rawInputContext: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: Invalid XML output halts the workflow
// ---------------------------------------------------------------------------
describe("executeTransformNode activity — malformed XML output halts workflow", () => {
  it("throws ApplicationFailure when rendered XML is not well-formed", async () => {
    // Provide an xmlEnvelope missing its closing tag — after payload injection
    // the final string will be structurally invalid XML.
    const params = buildParams({
      outputFormat: "xml",
      fieldMapping: JSON.stringify({ Name: "Alice" }),
      // Missing </root> closing tag — produces invalid XML after injection
      xmlEnvelope: "<root>{{payload}}",
    });

    await expect(executeTransformNode(params)).rejects.toBeInstanceOf(
      ApplicationFailure,
    );
  });

  it("throws a non-retryable ApplicationFailure for malformed XML", async () => {
    const params = buildParams({
      outputFormat: "xml",
      fieldMapping: JSON.stringify({ Name: "Alice" }),
      xmlEnvelope: "<root>{{payload}}",
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

  it("sets failure type to TRANSFORM_OUTPUT_ERROR for malformed XML", async () => {
    const params = buildParams({
      outputFormat: "xml",
      fieldMapping: JSON.stringify({ Name: "Alice" }),
      xmlEnvelope: "<root>{{payload}}",
    });

    let caught: unknown;
    try {
      await executeTransformNode(params);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApplicationFailure);
    const failure = caught as ApplicationFailure;
    expect(failure.type).toBe("TRANSFORM_OUTPUT_ERROR");
  });

  it("includes the output format in the failure message for malformed XML", async () => {
    const params = buildParams({
      outputFormat: "xml",
      fieldMapping: JSON.stringify({ Name: "Alice" }),
      xmlEnvelope: "<root>{{payload}}",
    });

    let caught: unknown;
    try {
      await executeTransformNode(params);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApplicationFailure);
    const failure = caught as ApplicationFailure;
    expect(failure.message).toContain("xml");
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Malformed JSON output halts the workflow
// ---------------------------------------------------------------------------
describe("executeTransformNode activity — malformed JSON output halts workflow", () => {
  beforeEach(() => {
    renderJsonMock.mockReturnValue("{ invalid json !!!");
  });

  afterEach(() => {
    renderJsonMock.mockReset();
  });

  it("throws ApplicationFailure when rendered JSON fails JSON.parse", async () => {
    const params = buildParams({
      outputFormat: "json",
      fieldMapping: JSON.stringify({ field: "value" }),
    });

    await expect(executeTransformNode(params)).rejects.toBeInstanceOf(
      ApplicationFailure,
    );
  });

  it("throws a non-retryable ApplicationFailure for malformed JSON", async () => {
    const params = buildParams({
      outputFormat: "json",
      fieldMapping: JSON.stringify({ field: "value" }),
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

  it("sets failure type to TRANSFORM_OUTPUT_ERROR for malformed JSON", async () => {
    const params = buildParams({
      outputFormat: "json",
      fieldMapping: JSON.stringify({ field: "value" }),
    });

    let caught: unknown;
    try {
      await executeTransformNode(params);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApplicationFailure);
    const failure = caught as ApplicationFailure;
    expect(failure.type).toBe("TRANSFORM_OUTPUT_ERROR");
  });

  it("includes the output format in the failure message for malformed JSON", async () => {
    const params = buildParams({
      outputFormat: "json",
      fieldMapping: JSON.stringify({ field: "value" }),
    });

    let caught: unknown;
    try {
      await executeTransformNode(params);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApplicationFailure);
    const failure = caught as ApplicationFailure;
    expect(failure.message).toContain("json");
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Malformed CSV output halts the workflow
// ---------------------------------------------------------------------------
describe("executeTransformNode activity — malformed CSV output halts workflow", () => {
  beforeEach(() => {
    // Produce a CSV string with mismatched quotes, which csv/sync rejects
    renderCsvMock.mockReturnValue('name,value\n"unclosed quote,bad');
  });

  afterEach(() => {
    renderCsvMock.mockReset();
  });

  it("throws ApplicationFailure when rendered CSV fails CSV parsing", async () => {
    const params = buildParams({
      outputFormat: "csv",
      fieldMapping: JSON.stringify({ name: "Alice" }),
    });

    await expect(executeTransformNode(params)).rejects.toBeInstanceOf(
      ApplicationFailure,
    );
  });

  it("throws a non-retryable ApplicationFailure for malformed CSV", async () => {
    const params = buildParams({
      outputFormat: "csv",
      fieldMapping: JSON.stringify({ name: "Alice" }),
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

  it("sets failure type to TRANSFORM_OUTPUT_ERROR for malformed CSV", async () => {
    const params = buildParams({
      outputFormat: "csv",
      fieldMapping: JSON.stringify({ name: "Alice" }),
    });

    let caught: unknown;
    try {
      await executeTransformNode(params);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApplicationFailure);
    const failure = caught as ApplicationFailure;
    expect(failure.type).toBe("TRANSFORM_OUTPUT_ERROR");
  });

  it("includes the output format in the failure message for malformed CSV", async () => {
    const params = buildParams({
      outputFormat: "csv",
      fieldMapping: JSON.stringify({ name: "Alice" }),
    });

    let caught: unknown;
    try {
      await executeTransformNode(params);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApplicationFailure);
    const failure = caught as ApplicationFailure;
    expect(failure.message).toContain("csv");
  });
});
