import { XMLParser } from "fast-xml-parser";
import { renderXml, XmlRenderError } from "./xml-renderer";

// ---------------------------------------------------------------------------
// Scenario 1: Top-level mapping keys become child elements of root element
// ---------------------------------------------------------------------------
describe("renderXml - flat mapping", () => {
  it("top-level mapping keys become child elements of the root element", () => {
    const mapping = { FirstName: "Alice", CaseID: "CASE-001" };
    const result = renderXml(mapping);
    expect(result).toContain(
      "<FirstName>Alice</FirstName><CaseID>CASE-001</CaseID>",
    );
  });

  it("multiple top-level keys all appear as sibling child elements", () => {
    const mapping = { A: "1", B: "2", C: "3" };
    const result = renderXml(mapping);
    expect(result).toContain("<A>1</A><B>2</B><C>3</C>");
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Nested mapping objects produce nested XML elements
// ---------------------------------------------------------------------------
describe("renderXml - nested mapping", () => {
  it("nested mapping object produces nested XML elements", () => {
    const mapping = { Person: { Name: "Alice" } };
    const result = renderXml(mapping);
    expect(result).toContain("<Person><Name>Alice</Name></Person>");
  });

  it("deeply nested object preserves full nesting depth", () => {
    const mapping = { A: { B: { C: "deep" } } };
    const result = renderXml(mapping);
    expect(result).toContain("<A><B><C>deep</C></B></A>");
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Output includes a configurable or default root element
// ---------------------------------------------------------------------------
describe("renderXml - root element", () => {
  it("wraps output in the default <Root> element when none is specified", () => {
    const mapping = { Name: "Alice" };
    const result = renderXml(mapping);
    expect(result).toMatch(/^<Root>/);
    expect(result).toMatch(/<\/Root>$/);
  });

  it("wraps output in a custom root element when provided", () => {
    const mapping = { Name: "Alice" };
    const result = renderXml(mapping, "Payload");
    expect(result).toMatch(/^<Payload>/);
    expect(result).toMatch(/<\/Payload>$/);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Output is parseable by a standard XML parser
// ---------------------------------------------------------------------------
describe("renderXml - parseable output", () => {
  it("flat mapping output is parseable and preserves structure", () => {
    const mapping = { FirstName: "Alice", LastName: "Smith" };
    const result = renderXml(mapping);

    const parser = new XMLParser({ parseTagValue: false });
    const parsed = parser.parse(result) as Record<string, unknown>;

    expect(parsed).toHaveProperty("Root");
    const root = parsed.Root as Record<string, unknown>;
    expect(root.FirstName).toBe("Alice");
    expect(root.LastName).toBe("Smith");
  });

  it("nested mapping output is parseable without error", () => {
    const mapping = { Person: { Name: "Alice", City: "Vancouver" } };
    const result = renderXml(mapping);

    const parser = new XMLParser({ parseTagValue: false });
    const parsed = parser.parse(result) as Record<string, unknown>;

    expect(parsed).toHaveProperty("Root");
    const root = parsed.Root as Record<string, unknown>;
    const person = root.Person as Record<string, unknown>;
    expect(person.Name).toBe("Alice");
    expect(person.City).toBe("Vancouver");
  });

  it("output with a custom root element is parseable", () => {
    const mapping = { Field: "value" };
    const result = renderXml(mapping, "Envelope");

    const parser = new XMLParser({ parseTagValue: false });
    const parsed = parser.parse(result) as Record<string, unknown>;

    expect(parsed).toHaveProperty("Envelope");
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Rendering failure throws structured error
// ---------------------------------------------------------------------------
describe("renderXml - rendering failure", () => {
  it("throws XmlRenderError for a key containing a space (illegal XML name)", () => {
    const mapping = { "Invalid Name": "value" } as Record<string, unknown>;
    expect(() => renderXml(mapping)).toThrow(XmlRenderError);
    expect(() => renderXml(mapping)).toThrow("Failed to render XML output:");
  });

  it("throws XmlRenderError for a key starting with a digit", () => {
    const mapping = { "123invalid": "value" } as Record<string, unknown>;
    expect(() => renderXml(mapping)).toThrow(XmlRenderError);
  });

  it("throws XmlRenderError for a key containing angle brackets", () => {
    const mapping = { "<bad>": "value" } as Record<string, unknown>;
    expect(() => renderXml(mapping)).toThrow(XmlRenderError);
  });

  it("XmlRenderError exposes the detail property", () => {
    const mapping = { "bad key": "value" } as Record<string, unknown>;
    try {
      renderXml(mapping);
      fail("expected error to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(XmlRenderError);
      expect((err as XmlRenderError).detail).toBeTruthy();
    }
  });

  it("throws XmlRenderError for an invalid custom root element name", () => {
    const mapping = { Name: "Alice" };
    expect(() => renderXml(mapping, "123invalid")).toThrow(XmlRenderError);
    expect(() => renderXml(mapping, "123invalid")).toThrow(
      "Failed to render XML output:",
    );
  });

  it("throws XmlRenderError for an invalid key in a nested object", () => {
    const mapping = { Person: { "bad key": "value" } } as Record<
      string,
      unknown
    >;
    expect(() => renderXml(mapping)).toThrow(XmlRenderError);
    expect(() => renderXml(mapping)).toThrow("Person.bad key");
  });
});
