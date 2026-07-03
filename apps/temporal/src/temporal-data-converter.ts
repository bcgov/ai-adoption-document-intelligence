import { GzipPayloadCodec } from "@ai-di/temporal-payload-codec";
import { DefaultPayloadConverter } from "@temporalio/common";

/** Payload codecs + converter used by the Temporal worker and clients. */
export const temporalDataConverter = {
  payloadConverter: new DefaultPayloadConverter(),
  payloadCodecs: [new GzipPayloadCodec()],
};
