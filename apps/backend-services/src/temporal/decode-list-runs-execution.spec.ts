import { GzipPayloadCodec } from "@ai-di/temporal-payload-codec";
import { defaultPayloadConverter } from "@temporalio/client";
import type { temporal } from "@temporalio/proto";
import { decodeListRunsExecution } from "./temporal-client.service";

/**
 * Regression cover for the run-history version pin.
 *
 * The memo is written through `GzipPayloadCodec`, but payload codecs are NOT
 * applied to memo fields on the way back out — `describe` / `list` return the
 * memo as raw protobuf. So the decoder receives a `binary/gzip` payload, an
 * encoding `defaultPayloadConverter` rejects. Every run then reported a null
 * version number while its sibling `workflowVersionId` (a SEARCH ATTRIBUTE,
 * which codecs never touch) decoded fine.
 *
 * These tests encode through the REAL codec rather than a hand-built payload,
 * so they fail if the codec's wire format changes rather than agreeing with a
 * stale assumption about it.
 */
describe("decodeListRunsExecution — version pin", () => {
  const codec = new GzipPayloadCodec();

  /** Build a memo exactly as the client writes one, through the codec. */
  async function gzippedMemo(
    value: unknown,
  ): Promise<temporal.api.common.v1.IMemo> {
    const raw = defaultPayloadConverter.toPayload(value);
    const [encoded] = await codec.encode([
      raw as Parameters<typeof codec.encode>[0][number],
    ]);
    return {
      fields: {
        workflowVersion: encoded as temporal.api.common.v1.IPayload,
      },
    };
  }

  function execution(
    memo: temporal.api.common.v1.IMemo | null,
  ): temporal.api.workflow.v1.IWorkflowExecutionInfo {
    // No startTime: these assert the version pin, and the decoder defaults a
    // missing timestamp. Supplying one would need a `Long`, which adds noise.
    return {
      execution: { workflowId: "graph-adhoc-1", runId: "r1" },
      status: 2, // COMPLETED
      memo,
    } as temporal.api.workflow.v1.IWorkflowExecutionInfo;
  }

  it("reads the version number from a gzip-compressed memo", async () => {
    const memo = await gzippedMemo(7);
    expect(decodeListRunsExecution(execution(memo)).versionNumber).toBe(7);
  });

  it("still reads an uncompressed memo (codec disabled or legacy run)", () => {
    const memo: temporal.api.common.v1.IMemo = {
      fields: {
        workflowVersion: defaultPayloadConverter.toPayload(
          3,
        ) as temporal.api.common.v1.IPayload,
      },
    };
    expect(decodeListRunsExecution(execution(memo)).versionNumber).toBe(3);
  });

  it("returns null when the memo carries no version at all", () => {
    expect(
      decodeListRunsExecution(execution({ fields: {} })).versionNumber,
    ).toBeNull();
    expect(decodeListRunsExecution(execution(null)).versionNumber).toBeNull();
  });

  it("returns null when the version is not a number", async () => {
    const memo = await gzippedMemo("v7");
    expect(decodeListRunsExecution(execution(memo)).versionNumber).toBeNull();
  });
});
