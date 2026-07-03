import {
  DefaultPayloadConverter,
  METADATA_ENCODING_KEY,
} from "@temporalio/common";
import {
  GZIP_ORIGINAL_ENCODING_METADATA_KEY,
  GZIP_PAYLOAD_CODEC_ENCODING,
  GzipPayloadCodec,
} from "./gzip-payload-codec";

describe("GzipPayloadCodec", () => {
  const payloadConverter = new DefaultPayloadConverter();
  const codec = new GzipPayloadCodec();

  it("round-trips through gzip and restores json encoding metadata", async () => {
    const original = payloadConverter.toPayload({ workflowVersionId: "wv-1" });
    const [encoded] = await codec.encode([original]);
    expect(
      new TextDecoder().decode(encoded.metadata![METADATA_ENCODING_KEY]),
    ).toBe(GZIP_PAYLOAD_CODEC_ENCODING);
    expect(encoded.metadata![GZIP_ORIGINAL_ENCODING_METADATA_KEY]).toBeDefined();

    const [decoded] = await codec.decode([encoded]);
    expect(
      new TextDecoder().decode(decoded.metadata![METADATA_ENCODING_KEY]),
    ).toBe("json/plain");

    const value = payloadConverter.fromPayload<{ workflowVersionId: string }>(
      decoded,
    );
    expect(value).toEqual({ workflowVersionId: "wv-1" });
  });
});
