import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import {
  encodingKeys,
  METADATA_ENCODING_KEY,
  type Payload,
  type PayloadCodec,
} from "@temporalio/common";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/** Metadata encoding label for gzip-compressed payloads (Temporal SDK convention). */
export const GZIP_PAYLOAD_CODEC_ENCODING = "binary/gzip";

/**
 * Preserves the pre-gzip PayloadConverter encoding so decode can restore it after gunzip.
 * Without this, `encoding` is overwritten with `binary/gzip` and stripped on decode,
 * leaving payloads that fail with `Unknown encoding:` in the PayloadConverter.
 */
export const GZIP_ORIGINAL_ENCODING_METADATA_KEY = "gzip-original-encoding";

/**
 * Gzip-compresses Temporal payloads after PayloadConverter serialization.
 * Wire with `dataConverter: { payloadCodecs: [new GzipPayloadCodec()] }` on worker and clients.
 */
export class GzipPayloadCodec implements PayloadCodec {
  async encode(payloads: Payload[]): Promise<Payload[]> {
    return Promise.all(
      payloads.map(async (payload) => {
        if (!payload.data || payload.data.length === 0) {
          return payload;
        }
        const compressed = await gzipAsync(payload.data);
        const originalEncoding = payload.metadata?.[METADATA_ENCODING_KEY];
        return {
          metadata: {
            ...payload.metadata,
            ...(originalEncoding !== undefined && {
              [GZIP_ORIGINAL_ENCODING_METADATA_KEY]: originalEncoding,
            }),
            [METADATA_ENCODING_KEY]: new TextEncoder().encode(
              GZIP_PAYLOAD_CODEC_ENCODING,
            ),
          },
          data: compressed,
        };
      }),
    );
  }

  async decode(payloads: Payload[]): Promise<Payload[]> {
    return Promise.all(
      payloads.map(async (payload) => {
        const encoding = payload.metadata?.[METADATA_ENCODING_KEY]
          ? new TextDecoder().decode(payload.metadata[METADATA_ENCODING_KEY])
          : "";
        if (encoding !== GZIP_PAYLOAD_CODEC_ENCODING) {
          return payload;
        }
        if (!payload.data || payload.data.length === 0) {
          return payload;
        }
        const decompressed = await gunzipAsync(payload.data);
        const originalEncoding =
          payload.metadata?.[GZIP_ORIGINAL_ENCODING_METADATA_KEY] ??
          encodingKeys.METADATA_ENCODING_JSON;
        const {
          [METADATA_ENCODING_KEY]: _gzipEncoding,
          [GZIP_ORIGINAL_ENCODING_METADATA_KEY]: _stored,
          ...restMetadata
        } = payload.metadata ?? {};
        return {
          metadata: {
            ...restMetadata,
            [METADATA_ENCODING_KEY]: originalEncoding,
          },
          data: decompressed,
        };
      }),
    );
  }
}
