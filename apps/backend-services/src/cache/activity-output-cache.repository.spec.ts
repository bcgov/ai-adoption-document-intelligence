import { DEFAULT_CACHE_TTL_MS } from "@ai-di/graph-workflow";
import type { ActivityOutputCache } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { ActivityOutputCacheRepository } from "./activity-output-cache.repository";

const mockPrismaClient = {
  activityOutputCache: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const SAMPLE_KEY = {
  workflowLineageId: "wfl-1",
  nodeId: "node-1",
  configHash: "cfg-hash",
  inputHash: "in-hash",
};

const baseRow = (
  overrides: Partial<ActivityOutputCache> = {},
): ActivityOutputCache => ({
  id: "row-1",
  workflowLineageId: SAMPLE_KEY.workflowLineageId,
  nodeId: SAMPLE_KEY.nodeId,
  configHash: SAMPLE_KEY.configHash,
  inputHash: SAMPLE_KEY.inputHash,
  outputCtx: { hello: "world" },
  outputKind: "Document",
  createdAt: new Date("2026-05-24T12:00:00Z"),
  expiresAt: new Date("2026-05-25T12:00:00Z"),
  ...overrides,
});

describe("ActivityOutputCacheRepository", () => {
  let repository: ActivityOutputCacheRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityOutputCacheRepository,
        { provide: PrismaService, useValue: { prisma: mockPrismaClient } },
      ],
    }).compile();

    repository = module.get<ActivityOutputCacheRepository>(
      ActivityOutputCacheRepository,
    );
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("findFresh", () => {
    it("returns the row when found and expiresAt is in the future (hit)", async () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-05-24T13:00:00Z"));
      const row = baseRow({
        expiresAt: new Date("2026-05-24T14:00:00Z"),
      });
      mockPrismaClient.activityOutputCache.findUnique.mockResolvedValue(row);

      const result = await repository.findFresh(SAMPLE_KEY);

      expect(result).toEqual(row);
      expect(
        mockPrismaClient.activityOutputCache.findUnique,
      ).toHaveBeenCalledWith({
        where: {
          workflowLineageId_nodeId_configHash_inputHash: {
            workflowLineageId: SAMPLE_KEY.workflowLineageId,
            nodeId: SAMPLE_KEY.nodeId,
            configHash: SAMPLE_KEY.configHash,
            inputHash: SAMPLE_KEY.inputHash,
          },
        },
      });
    });

    it("returns null when the row exists but has expired (miss-expired)", async () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-05-24T13:00:00Z"));
      const row = baseRow({
        expiresAt: new Date("2026-05-24T12:00:00Z"),
      });
      mockPrismaClient.activityOutputCache.findUnique.mockResolvedValue(row);

      const result = await repository.findFresh(SAMPLE_KEY);

      expect(result).toBeNull();
    });

    it("returns null when no row exists for the unique key (miss-no-row)", async () => {
      mockPrismaClient.activityOutputCache.findUnique.mockResolvedValue(null);

      const result = await repository.findFresh(SAMPLE_KEY);

      expect(result).toBeNull();
    });
  });

  describe("upsert", () => {
    it("inserts a new row with expiresAt = now + DEFAULT_CACHE_TTL_MS when ttlMs is omitted (insert)", async () => {
      const now = new Date("2026-05-24T12:00:00Z");
      jest.useFakeTimers().setSystemTime(now);

      const inserted = baseRow({
        outputCtx: { fresh: true },
        outputKind: "OcrResult",
        expiresAt: new Date(now.getTime() + DEFAULT_CACHE_TTL_MS),
      });
      mockPrismaClient.activityOutputCache.upsert.mockResolvedValue(inserted);

      const result = await repository.upsert({
        ...SAMPLE_KEY,
        outputCtx: { fresh: true },
        outputKind: "OcrResult",
      });

      expect(result).toEqual(inserted);
      expect(mockPrismaClient.activityOutputCache.upsert).toHaveBeenCalledWith({
        where: {
          workflowLineageId_nodeId_configHash_inputHash: {
            workflowLineageId: SAMPLE_KEY.workflowLineageId,
            nodeId: SAMPLE_KEY.nodeId,
            configHash: SAMPLE_KEY.configHash,
            inputHash: SAMPLE_KEY.inputHash,
          },
        },
        create: {
          workflowLineageId: SAMPLE_KEY.workflowLineageId,
          nodeId: SAMPLE_KEY.nodeId,
          configHash: SAMPLE_KEY.configHash,
          inputHash: SAMPLE_KEY.inputHash,
          outputCtx: { fresh: true },
          outputKind: "OcrResult",
          expiresAt: new Date(now.getTime() + DEFAULT_CACHE_TTL_MS),
        },
        update: {
          outputCtx: { fresh: true },
          outputKind: "OcrResult",
          expiresAt: new Date(now.getTime() + DEFAULT_CACHE_TTL_MS),
        },
      });
    });

    it("overwrites the row's mutable payload columns and uses ttlMs override (overwrite)", async () => {
      const now = new Date("2026-05-24T12:00:00Z");
      jest.useFakeTimers().setSystemTime(now);
      const ttlMs = 60_000;

      const overwritten = baseRow({
        outputCtx: { fresh: "v2" },
        outputKind: null,
        expiresAt: new Date(now.getTime() + ttlMs),
      });
      mockPrismaClient.activityOutputCache.upsert.mockResolvedValue(
        overwritten,
      );

      const result = await repository.upsert({
        ...SAMPLE_KEY,
        outputCtx: { fresh: "v2" },
        ttlMs,
      });

      expect(result).toEqual(overwritten);
      expect(mockPrismaClient.activityOutputCache.upsert).toHaveBeenCalledWith({
        where: {
          workflowLineageId_nodeId_configHash_inputHash: {
            workflowLineageId: SAMPLE_KEY.workflowLineageId,
            nodeId: SAMPLE_KEY.nodeId,
            configHash: SAMPLE_KEY.configHash,
            inputHash: SAMPLE_KEY.inputHash,
          },
        },
        create: {
          workflowLineageId: SAMPLE_KEY.workflowLineageId,
          nodeId: SAMPLE_KEY.nodeId,
          configHash: SAMPLE_KEY.configHash,
          inputHash: SAMPLE_KEY.inputHash,
          outputCtx: { fresh: "v2" },
          outputKind: null,
          expiresAt: new Date(now.getTime() + ttlMs),
        },
        update: {
          outputCtx: { fresh: "v2" },
          outputKind: null,
          expiresAt: new Date(now.getTime() + ttlMs),
        },
      });
    });
  });

  describe("deleteExpired", () => {
    it("deletes rows where expiresAt < now and returns the count", async () => {
      const now = new Date("2026-05-24T12:00:00Z");
      jest.useFakeTimers().setSystemTime(now);

      mockPrismaClient.activityOutputCache.deleteMany.mockResolvedValue({
        count: 7,
      });

      const result = await repository.deleteExpired();

      expect(result).toBe(7);
      expect(
        mockPrismaClient.activityOutputCache.deleteMany,
      ).toHaveBeenCalledWith({
        where: {
          expiresAt: { lt: now },
        },
      });
    });
  });
});
