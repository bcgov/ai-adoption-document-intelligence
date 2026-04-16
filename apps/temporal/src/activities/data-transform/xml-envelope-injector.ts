const PAYLOAD_PLACEHOLDER = "{{payload}}";

/** Structured error thrown when the envelope template is misconfigured. */
export class XmlEnvelopeConfigError extends Error {
  constructor(public readonly detail: string) {
    super(`XML envelope configuration error: ${detail}`);
    this.name = "XmlEnvelopeConfigError";
  }
}

/**
 * Injects an inner XML payload string into an XML envelope template.
 *
 * If `xmlEnvelope` is `undefined` or an empty string the inner XML is
 * returned unchanged (Scenario 2 — no envelope configured).
 *
 * Otherwise the function performs a single string substitution of the
 * `{{payload}}` placeholder in the envelope template with the inner XML
 * string. Having zero or more than one occurrence of the placeholder is
 * treated as a configuration error (Scenario 3).
 *
 * @param innerXml - The rendered XML string produced by the XML output renderer.
 * @param xmlEnvelope - Optional envelope template containing exactly one
 *   `{{payload}}` placeholder.
 * @returns The final XML string: either the envelope with the payload
 *   injected, or the bare inner XML when no envelope is provided.
 * @throws {XmlEnvelopeConfigError} If the envelope template does not contain
 *   exactly one `{{payload}}` placeholder.
 */
export function injectXmlEnvelope(
  innerXml: string,
  xmlEnvelope?: string,
): string {
  if (!xmlEnvelope || xmlEnvelope.trim() === "") {
    return innerXml;
  }

  const occurrences = xmlEnvelope.split(PAYLOAD_PLACEHOLDER).length - 1;

  if (occurrences === 0) {
    throw new XmlEnvelopeConfigError(
      `envelope template must contain the "${PAYLOAD_PLACEHOLDER}" placeholder`,
    );
  }

  if (occurrences > 1) {
    throw new XmlEnvelopeConfigError(
      `envelope template must contain exactly one "${PAYLOAD_PLACEHOLDER}" placeholder but found ${occurrences}`,
    );
  }

  return xmlEnvelope.replace(PAYLOAD_PLACEHOLDER, innerXml);
}
