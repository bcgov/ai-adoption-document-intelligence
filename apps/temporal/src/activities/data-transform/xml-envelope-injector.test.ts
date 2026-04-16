import { XMLParser } from "fast-xml-parser";
import {
  injectXmlEnvelope,
  XmlEnvelopeConfigError,
} from "./xml-envelope-injector";

const INNER_XML = "<Root><Name>Alice</Name></Root>";
const SOAP_ENVELOPE = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>{{payload}}</soapenv:Body></soapenv:Envelope>`;

// ---------------------------------------------------------------------------
// Scenario 1: Envelope with {{payload}} placeholder receives inner XML
// ---------------------------------------------------------------------------
describe("injectXmlEnvelope - envelope with placeholder", () => {
  it("replaces {{payload}} in the envelope template with the inner XML string", () => {
    const result = injectXmlEnvelope(INNER_XML, SOAP_ENVELOPE);
    expect(result).toContain(INNER_XML);
    expect(result).not.toContain("{{payload}}");
  });

  it("preserves the rest of the envelope around the injected payload", () => {
    const envelope = "<Wrapper>{{payload}}</Wrapper>";
    const result = injectXmlEnvelope(INNER_XML, envelope);
    expect(result).toBe(`<Wrapper>${INNER_XML}</Wrapper>`);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: No envelope configured produces inner XML only
// ---------------------------------------------------------------------------
describe("injectXmlEnvelope - no envelope", () => {
  it("returns inner XML unchanged when xmlEnvelope is undefined", () => {
    expect(injectXmlEnvelope(INNER_XML, undefined)).toBe(INNER_XML);
  });

  it("returns inner XML unchanged when xmlEnvelope is an empty string", () => {
    expect(injectXmlEnvelope(INNER_XML, "")).toBe(INNER_XML);
  });

  it("returns inner XML unchanged when xmlEnvelope is whitespace only", () => {
    expect(injectXmlEnvelope(INNER_XML, "   ")).toBe(INNER_XML);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Envelope missing {{payload}} placeholder throws structured error
// ---------------------------------------------------------------------------
describe("injectXmlEnvelope - missing placeholder", () => {
  it("throws XmlEnvelopeConfigError when the envelope has no {{payload}}", () => {
    const envelope = "<Wrapper><NoPlaceholder/></Wrapper>";
    expect(() => injectXmlEnvelope(INNER_XML, envelope)).toThrow(
      XmlEnvelopeConfigError,
    );
    expect(() => injectXmlEnvelope(INNER_XML, envelope)).toThrow(
      "XML envelope configuration error:",
    );
  });

  it("throws XmlEnvelopeConfigError when {{payload}} appears more than once", () => {
    const envelope = "<Wrapper>{{payload}}{{payload}}</Wrapper>";
    expect(() => injectXmlEnvelope(INNER_XML, envelope)).toThrow(
      XmlEnvelopeConfigError,
    );
    expect(() => injectXmlEnvelope(INNER_XML, envelope)).toThrow("exactly one");
  });

  it("exposes the detail property on XmlEnvelopeConfigError", () => {
    const envelope = "<Wrapper/>";
    try {
      injectXmlEnvelope(INNER_XML, envelope);
      fail("expected error to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(XmlEnvelopeConfigError);
      expect((err as XmlEnvelopeConfigError).detail).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Resulting output is valid XML
// ---------------------------------------------------------------------------
describe("injectXmlEnvelope - output is valid XML", () => {
  it("resulting output is parseable by a standard XML parser", () => {
    const envelope = "<Envelope><Body>{{payload}}</Body></Envelope>";
    const result = injectXmlEnvelope(INNER_XML, envelope);

    const parser = new XMLParser({ parseTagValue: false });
    expect(() => parser.parse(result)).not.toThrow();

    const parsed = parser.parse(result) as Record<string, unknown>;
    expect(parsed).toHaveProperty("Envelope");
  });

  it("SOAP-style envelope with inner XML is parseable", () => {
    const result = injectXmlEnvelope(INNER_XML, SOAP_ENVELOPE);

    const parser = new XMLParser({
      parseTagValue: false,
      ignoreAttributes: false,
    });
    expect(() => parser.parse(result)).not.toThrow();
  });
});
