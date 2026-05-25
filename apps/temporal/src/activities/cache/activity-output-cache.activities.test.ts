/**
 * Unit tests for the Phase 4 try-in-place cache activities (US-131).
 *
 * Covers all four scenarios required by the story: findFresh-hit,
 * findFresh-miss (no row + expired row), upsert-insert, upsert-overwrite,
 * plus the static activity-options shape (Scenario 4) and the
 * `nonCacheable: true` marker the US-132 worker decorator relies on
 * (Scenario 1).
 *
 * The temporal test harness uses Jest's standard Prisma-client mock via
 * `jest.mock("../database-client")` — the same pattern the existing
 * `get-workflow-graph-config.test.ts` spec uses.
 */

import { DEFAULT_CACHE_TTL_MS } from "@ai-di/graph-workflow";
import { getPrismaClient } from "../database-client";
import {
  ACTIVITY_OUTPUT_CACHE_ACTIVITY_OPTIONS,
  activityOutputCache,
} from "./activity-output-cache.activities";

jest.mock("../database-client", () => ({
  getPrismaClient: jest.fn(),
}));

const getPrismaClientMock = getPrismaClient as jest.Mock;

const SAMPLE_KEY = {
  workflowLineageId: "wfl-1",
  nodeId: "node-1",
  configHash: "cfg-hash",
  inputHash: "in-hash",
};

const UNIQUE_WHERE = {
  workflowLineageId_nodeId_configHash_inputHash: {
    workflowLineageId: SAMPLE_KEY.workflowLineageId,
    nodeId: SAMPLE_KEY.nodeId,
    configHash: SAMPLE_KEY.configHash,
    inputHash: SAMPLE_KEY.inputHash,
  },
};

describe("activityOutputCache activities (US-131)", () => {
  let prismaMock: {
    activityOutputCache: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prismaMock = {
      activityOutputCache: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    getPrismaClientMock.mockReturnValue(prismaMock);
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  describe("findFresh", () => {
    it("returns { outputCtx, outputKind } when a fresh row exists (hit)", async () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-05-24T13:00:00Z"));
      prismaMock.activityOutputCache.findUnique.mockResolvedValue({
        id: "row-1",
        workflowLineageId: SAMPLE_KEY.workflowLineageId,
        nodeId: SAMPLE_KEY.nodeId,
        configHash: SAMPLE_KEY.configHash,
        inputHash: SAMPLE_KEY.inputHash,
        outputCtx: { document: { id: "doc-1" } },
        outputKind: "Document",
        createdAt: new Date("2026-05-24T12:00:00Z"),
        expiresAt: new Date("2026-05-24T14:00:00Z"),
      });

      const result = await activityOutputCache.findFresh(SAMPLE_KEY);

      expect(result).toEqual({
        outputCtx: { document: { id: "doc-1" } },
        outputKind: "Document",
      });
      expect(prismaMock.activityOutputCache.findUnique).toHaveBeenCalledWith({
        where: UNIQUE_WHERE,
      });
    });

    it("returns null when no row exists for the unique key (miss-no-row)", async () => {
      prismaMock.activityOutputCache.findUnique.mockResolvedValue(null);

      const result = await activityOutputCache.findFresh(SAMPLE_KEY);

      expect(result).toBeNull();
      expect(prismaMock.activityOutputCache.findUnique).toHaveBeenCalledWith({
        where: UNIQUE_WHERE,
      });
    });

    it("returns null when the row exists but has expired (miss-expired)", async () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-05-24T13:00:00Z"));
      prismaMock.activityOutputCache.findUnique.mockResolvedValue({
        id: "row-1",
        workflowLineageId: SAMPLE_KEY.workflowLineageId,
        nodeId: SAMPLE_KEY.nodeId,
        configHash: SAMPLE_KEY.configHash,
        inputHash: SAMPLE_KEY.inputHash,
        outputCtx: { stale: true },
        outputKind: "OcrResult",
        createdAt: new Date("2026-05-23T10:00:00Z"),
        expiresAt: new Date("2026-05-24T12:00:00Z"),
      });

      const result = await activityOutputCache.findFresh(SAMPLE_KEY);

      expect(result).toBeNull();
    });
  });

  describe("upsert", () => {
    it("inserts a new row with expiresAt = now + DEFAULT_CACHE_TTL_MS when ttlMs is omitted (insert)", async () => {
      const now = new Date("2026-05-24T12:00:00Z");
      jest.useFakeTimers().setSystemTime(now);
      prismaMock.activityOutputCache.upsert.mockResolvedValue({ id: "row-1" });

      const result = await activityOutputCache.upsert({
        ...SAMPLE_KEY,
        outputCtx: { ocrResult: { confidence: 0.95 } },
        outputKind: "OcrResult",
      });

      expect(result).toBeUndefined();
      expect(prismaMock.activityOutputCache.upsert).toHaveBeenCalledWith({
        where: UNIQUE_WHERE,
        create: {
          workflowLineageId: SAMPLE_KEY.workflowLineageId,
          nodeId: SAMPLE_KEY.nodeId,
          configHash: SAMPLE_KEY.configHash,
          inputHash: SAMPLE_KEY.inputHash,
          outputCtx: { ocrResult: { confidence: 0.95 } },
          outputKind: "OcrResult",
          expiresAt: new Date(now.getTime() + DEFAULT_CACHE_TTL_MS),
        },
        update: {
          outputCtx: { ocrResult: { confidence: 0.95 } },
          outputKind: "OcrResult",
          expiresAt: new Date(now.getTime() + DEFAULT_CACHE_TTL_MS),
        },
      });
    });

    it("overwrites mutable payload columns and uses ttlMs override (overwrite / latest-wins)", async () => {
      const now = new Date("2026-05-24T12:00:00Z");
      jest.useFakeTimers().setSystemTime(now);
      const ttlMs = 60_000;
      prismaMock.activityOutputCache.upsert.mockResolvedValue({ id: "row-1" });

      const result = await activityOutputCache.upsert({
        ...SAMPLE_KEY,
        outputCtx: { ocrResult: { confidence: 0.99, revision: 2 } },
        ttlMs,
      });

      expect(result).toBeUndefined();
      expect(prismaMock.activityOutputCache.upsert).toHaveBeenCalledWith({
        where: UNIQUE_WHERE,
        create: {
          workflowLineageId: SAMPLE_KEY.workflowLineageId,
          nodeId: SAMPLE_KEY.nodeId,
          configHash: SAMPLE_KEY.configHash,
          inputHash: SAMPLE_KEY.inputHash,
          outputCtx: { ocrResult: { confidence: 0.99, revision: 2 } },
          outputKind: null,
          expiresAt: new Date(now.getTime() + ttlMs),
        },
        update: {
          outputCtx: { ocrResult: { confidence: 0.99, revision: 2 } },
          outputKind: null,
          expiresAt: new Date(now.getTime() + ttlMs),
        },
      });
    });
  });

  describe("gc (US-134)", () => {
    it("calls deleteMany with `expiresAt < now()` and returns the deleted count", async () => {
      const now = new Date("2026-05-24T13:00:00Z");
      jest.useFakeTimers().setSystemTime(now);
      prismaMock.activityOutputCache.deleteMany.mockResolvedValue({ count: 7 });

      const result = await activityOutputCache.gc();

      expect(result).toEqual({ deletedCount: 7 });
      expect(prismaMock.activityOutputCache.deleteMany).toHaveBeenCalledTimes(
        1,
      );
      const callArg =
        prismaMock.activityOutputCache.deleteMany.mock.calls[0][0];
      expect(callArg.where.expiresAt.lt).toBeInstanceOf(Date);
      expect((callArg.where.expiresAt.lt as Date).getTime()).toBe(
        now.getTime(),
      );
    });

    it("returns { deletedCount: 0 } when no rows are expired (no-rows case)", async () => {
      prismaMock.activityOutputCache.deleteMany.mockResolvedValue({ count: 0 });

      const result = await activityOutputCache.gc();

      expect(result).toEqual({ deletedCount: 0 });
      expect(prismaMock.activityOutputCache.deleteMany).toHaveBeenCalledTimes(
        1,
      );
    });
  });

  describe("activity-options metadata (Scenario 1 + 4)", () => {
    it("declares nonCacheable=true so the US-132 worker decorator skips wrapping these calls", () => {
      expect(ACTIVITY_OUTPUT_CACHE_ACTIVITY_OPTIONS.nonCacheable).toBe(true);
    });

    it("uses a short transient-fault retry policy and a 10s startToCloseTimeout", () => {
      expect(ACTIVITY_OUTPUT_CACHE_ACTIVITY_OPTIONS.startToCloseTimeout).toBe(
        "10 seconds",
      );
      expect(ACTIVITY_OUTPUT_CACHE_ACTIVITY_OPTIONS.retry).toEqual({
        maximumAttempts: 3,
        initialInterval: "100ms",
        backoffCoefficient: 2,
      });
    });
  });
});
