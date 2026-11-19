import { DEFAULT_CACHE_TTL_MS } from "@ai-di/graph-workflow";
import type { ActivityOutputCache } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { ActivityOutputCacheRepository } from "./activity-output-cache.repository";

const mockPrismaClient = {
  activityOutputCache: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
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

  describe("findMostRecentFresh", () => {
    it("returns the row with the highest createdAt where expiresAt > now (hit)", async () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-05-24T13:00:00Z"));
      const row = baseRow({
        createdAt: new Date("2026-05-24T12:30:00Z"),
        expiresAt: new Date("2026-05-25T12:30:00Z"),
      });
      mockPrismaClient.activityOutputCache.findFirst.mockResolvedValue(row);

      const result = await repository.findMostRecentFresh({
        workflowLineageId: SAMPLE_KEY.workflowLineageId,
        nodeId: SAMPLE_KEY.nodeId,
      });

      expect(result).toEqual(row);
      expect(
        mockPrismaClient.activityOutputCache.findFirst,
      ).toHaveBeenCalledWith({
        where: {
          workflowLineageId: SAMPLE_KEY.workflowLineageId,
          nodeId: SAMPLE_KEY.nodeId,
          expiresAt: { gt: new Date("2026-05-24T13:00:00Z") },
        },
        orderBy: { createdAt: "desc" },
      });
    });

    it("returns null when no fresh row matches", async () => {
      mockPrismaClient.activityOutputCache.findFirst.mockResolvedValue(null);

      const result = await repository.findMostRecentFresh({
        workflowLineageId: SAMPLE_KEY.workflowLineageId,
        nodeId: SAMPLE_KEY.nodeId,
      });

      expect(result).toBeNull();
    });
  });

  describe("findManyFresh", () => {
    it("reads the fresh rows matching any of the exact keys, in one query scoped to the lineage", async () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-05-24T13:00:00Z"));
      const a = baseRow({ id: "a", nodeId: "node-a", inputHash: "in-a" });
      const b = baseRow({ id: "b", nodeId: "node-b", inputHash: "in-b" });
      mockPrismaClient.activityOutputCache.findMany.mockResolvedValue([a, b]);

      const result = await repository.findManyFresh({
        workflowLineageId: SAMPLE_KEY.workflowLineageId,
        keys: [
          { nodeId: "node-a", configHash: "cfg-hash", inputHash: "in-a" },
          { nodeId: "node-b", configHash: "cfg-hash", inputHash: "in-b" },
        ],
      });

      expect(result).toEqual([a, b]);
      expect(
        mockPrismaClient.activityOutputCache.findMany,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockPrismaClient.activityOutputCache.findMany,
      ).toHaveBeenCalledWith({
        where: {
          workflowLineageId: SAMPLE_KEY.workflowLineageId,
          expiresAt: { gt: new Date("2026-05-24T13:00:00Z") },
          OR: [
            { nodeId: "node-a", configHash: "cfg-hash", inputHash: "in-a" },
            { nodeId: "node-b", configHash: "cfg-hash", inputHash: "in-b" },
          ],
        },
      });
    });

    it("never filters or orders by createdAt, so a row written before the run that reads it is still found", async () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-05-24T13:00:00Z"));
      mockPrismaClient.activityOutputCache.findMany.mockResolvedValue([]);

      await repository.findManyFresh({
        workflowLineageId: SAMPLE_KEY.workflowLineageId,
        keys: [
          {
            nodeId: SAMPLE_KEY.nodeId,
            configHash: SAMPLE_KEY.configHash,
            inputHash: SAMPLE_KEY.inputHash,
          },
        ],
      });

      const query = mockPrismaClient.activityOutputCache.findMany.mock
        .calls[0][0] as { where: Record<string, unknown>; orderBy?: unknown };
      expect(query.where).not.toHaveProperty("createdAt");
      expect(query.orderBy).toBeUndefined();
    });

    it("returns an empty array without querying when there are no keys", async () => {
      const result = await repository.findManyFresh({
        workflowLineageId: SAMPLE_KEY.workflowLineageId,
        keys: [],
      });

      expect(result).toEqual([]);
      expect(
        mockPrismaClient.activityOutputCache.findMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe("findManyMostRecentFresh", () => {
    it("queries all fresh rows for the lineage (createdAt desc) and dedupes to the most recent per node", async () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-05-24T13:00:00Z"));
      // Two nodes, node-a has two rows (the newer one must win).
      const aNew = baseRow({
        id: "a-new",
        nodeId: "node-a",
        createdAt: new Date("2026-05-24T12:30:00Z"),
      });
      const aOld = baseRow({
        id: "a-old",
        nodeId: "node-a",
        createdAt: new Date("2026-05-24T12:00:00Z"),
      });
      const b = baseRow({
        id: "b-1",
        nodeId: "node-b",
        createdAt: new Date("2026-05-24T12:15:00Z"),
      });
      // Repo asks Prisma for rows already ordered createdAt desc.
      mockPrismaClient.activityOutputCache.findMany.mockResolvedValue([
        aNew,
        b,
        aOld,
      ]);

      const result = await repository.findManyMostRecentFresh({
        workflowLineageId: SAMPLE_KEY.workflowLineageId,
      });

      expect(
        mockPrismaClient.activityOutputCache.findMany,
      ).toHaveBeenCalledWith({
        where: {
          workflowLineageId: SAMPLE_KEY.workflowLineageId,
          expiresAt: { gt: new Date("2026-05-24T13:00:00Z") },
        },
        orderBy: { createdAt: "desc" },
      });
      // One row per node, the newest for node-a.
      expect(result).toEqual([aNew, b]);
    });

    it("returns an empty array when the lineage has no fresh rows", async () => {
      mockPrismaClient.activityOutputCache.findMany.mockResolvedValue([]);
      const result = await repository.findManyMostRecentFresh({
        workflowLineageId: SAMPLE_KEY.workflowLineageId,
      });
      expect(result).toEqual([]);
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
