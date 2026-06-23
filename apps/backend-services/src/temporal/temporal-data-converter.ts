import { GzipPayloadCodec } from "@ai-di/temporal-payload-codec";
import { DefaultPayloadConverter } from "@temporalio/common";

export const temporalDataConverter = {
  payloadConverter: new DefaultPayloadConverter(),
  payloadCodecs: [new GzipPayloadCodec()],
};
