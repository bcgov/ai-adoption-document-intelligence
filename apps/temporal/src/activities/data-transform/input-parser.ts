import { parse as parseCsv } from "csv-parse/sync";
import { XMLParser, XMLValidator } from "fast-xml-parser";

/** Supported input formats for the data transform node. */
export type InputFormat = "json" | "xml" | "csv";

/** A structured error thrown when input parsing fails. */
export class InputParseError extends Error {
  constructor(
    public readonly format: InputFormat,
    public readonly detail: string,
  ) {
    super(`Failed to parse ${format} input: ${detail}`);
    this.name = "InputParseError";
  }
}

/**
 * Parses an upstream node's raw string output into an intermediate JavaScript
 * value based on the specified input format.
 *
 * @param input - The raw string to parse.
 * @param format - The expected format of the input string ("json", "xml", or "csv").
 * @returns A plain JavaScript object or array representing the parsed content.
 * @throws {InputParseError} If the input is empty, malformed, or does not match the format.
 */
export function parseInput(
  input: string,
  format: InputFormat,
): Record<string, unknown> | unknown[] {
  if (!input || input.trim() === "") {
    throw new InputParseError(
      format,
      "input was empty or contained only whitespace",
    );
  }

  switch (format) {
    case "json":
      return parseJson(input);
    case "xml":
      return parseXml(input);
    case "csv":
      return parseCsvInput(input);
  }
}

/**
 * Parses a JSON string into a JavaScript object or array.
 *
 * @param input - A valid JSON string.
 * @returns The parsed JavaScript value.
 * @throws {InputParseError} If the string is not valid JSON.
 */
function parseJson(input: string): Record<string, unknown> | unknown[] {
  try {
    const parsed: unknown = JSON.parse(input);
    if (parsed === null || typeof parsed !== "object") {
      throw new InputParseError(
        "json",
        "parsed value is not an object or array",
      );
    }
    return parsed as Record<string, unknown> | unknown[];
  } catch (err) {
    if (err instanceof InputParseError) throw err;
    const detail = err instanceof Error ? err.message : String(err);
    throw new InputParseError("json", detail);
  }
}

/**
 * Parses an XML string into a nested JavaScript object where element names
 * map to keys and text content maps to values.
 *
 * @param input - A valid XML string.
 * @returns The parsed JavaScript object.
 * @throws {InputParseError} If the string is not valid XML.
 */
function parseXml(input: string): Record<string, unknown> {
  const validation = XMLValidator.validate(input);
  if (validation !== true) {
    throw new InputParseError("xml", validation.err.msg);
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    allowBooleanAttributes: true,
  });
  try {
    const result: unknown = parser.parse(input);
    if (
      result === null ||
      typeof result !== "object" ||
      Array.isArray(result)
    ) {
      throw new InputParseError("xml", "parsed value is not a plain object");
    }
    return result as Record<string, unknown>;
  } catch (err) {
    if (err instanceof InputParseError) throw err;
    const detail = err instanceof Error ? err.message : String(err);
    throw new InputParseError("xml", detail);
  }
}

/**
 * Parses a CSV string (first row as headers) into an array of JavaScript
 * objects where each object's keys are the column headers.
 *
 * @param input - A valid CSV string with a header row.
 * @returns An array of row objects keyed by column headers.
 * @throws {InputParseError} If the string is not valid CSV.
 */
function parseCsvInput(input: string): unknown[] {
  try {
    const rows = parseCsv(input, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    return rows as unknown[];
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new InputParseError("csv", detail);
  }
}
