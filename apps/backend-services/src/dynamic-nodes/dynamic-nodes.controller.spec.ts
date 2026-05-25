import type { DynamicNodeSignature } from "@ai-di/graph-workflow";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Request } from "express";
import { DenoRunnerUnavailableError } from "./deno-runner.client";
import {
  DuplicateSlugError,
  DynamicNodeNotFoundError,
} from "./dynamic-node.errors";
import { DynamicNodeRepository } from "./dynamic-node.repository";
import { DynamicNodesController } from "./dynamic-nodes.controller";
import {
  DynamicNodesService,
  NameMismatchError,
  PublishValidationError,
} from "./dynamic-nodes.service";

const SAMPLE_SIGNATURE: DynamicNodeSignature = {
  name: "my-node",
  description: "Test node",
  category: "Custom",
  deterministic: false,
  inputs: [{ name: "document", kind: "Document", required: true }],
  outputs: [{ name: "result", kind: "Artifact" }],
  paramsSchema: { type: "object", properties: {}, additionalProperties: false },
  allowNet: [],
  timeoutMs: 60_000,
  maxMemoryMB: 256,
};

function makeReq(groupId: string | null, userId?: string): Request {
  return {
    resolvedIdentity:
      groupId === null
        ? null
        : {
            userId,
            isSystemAdmin: false,
            groupRoles: { [groupId]: "MEMBER" },
            actorId: "actor-1",
          },
  } as unknown as Request;
}

describe("DynamicNodesController", () => {
  let controller: DynamicNodesController;
  let service: {
    publish: jest.Mock;
    invalidateGroupCatalogCache: jest.Mock;
  };
  let repository: {
    findBySlugForGroup: jest.Mock;
    listForGroup: jest.Mock;
    softDelete: jest.Mock;
    countWorkflowsReferencingSlug: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      publish: jest.fn(),
      invalidateGroupCatalogCache: jest.fn(),
    };
    repository = {
      findBySlugForGroup: jest.fn(),
      listForGroup: jest.fn(),
      softDelete: jest.fn(),
      countWorkflowsReferencingSlug: jest.fn().mockResolvedValue(0),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DynamicNodesController],
      providers: [
        { provide: DynamicNodesService, useValue: service },
        { provide: DynamicNodeRepository, useValue: repository },
      ],
    }).compile();
    controller = module.get<DynamicNodesController>(DynamicNodesController);
  });

  describe("create (POST)", () => {
    it("returns 201-shape on success with version 1 + empty errors", async () => {
      service.publish.mockResolvedValue({
        slug: "my-node",
        version: 1,
        signature: SAMPLE_SIGNATURE,
      });
      const res = await controller.create(
        { script: "/* */" },
        makeReq("g-1", "u-1"),
      );
      expect(res).toEqual({
        slug: "my-node",
        version: 1,
        signature: SAMPLE_SIGNATURE,
        errors: [],
      });
      expect(service.publish).toHaveBeenCalledWith({
        groupId: "g-1",
        script: "/* */",
        mode: "create",
        actorUserId: "u-1",
      });
    });

    it("maps PublishValidationError to 400 BadRequestException with errors[]", async () => {
      service.publish.mockRejectedValue(
        new PublishValidationError([
          {
            stage: "ts-check",
            line: 10,
            column: 7,
            message: "TS error",
          },
        ]),
      );
      await expect(
        controller.create({ script: "/* */" }, makeReq("g-1")),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("maps DuplicateSlugError to 409 ConflictException", async () => {
      service.publish.mockRejectedValue(new DuplicateSlugError("my-node"));
      await expect(
        controller.create({ script: "/* */" }, makeReq("g-1")),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("maps DenoRunnerUnavailableError to 503 ServiceUnavailableException", async () => {
      service.publish.mockRejectedValue(
        new DenoRunnerUnavailableError("runner down"),
      );
      await expect(
        controller.create({ script: "/* */" }, makeReq("g-1")),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it("throws 401 when no identity is resolved", async () => {
      await expect(
        controller.create({ script: "/* */" }, makeReq(null)),
      ).rejects.toThrow();
    });
  });

  describe("update (PUT)", () => {
    it("returns 200-shape on success with the new version number", async () => {
      service.publish.mockResolvedValue({
        slug: "my-node",
        version: 4,
        signature: SAMPLE_SIGNATURE,
      });
      const res = await controller.update(
        "my-node",
        { script: "/* */" },
        makeReq("g-1"),
      );
      expect(res.version).toBe(4);
      expect(service.publish).toHaveBeenCalledWith({
        groupId: "g-1",
        pathSlug: "my-node",
        script: "/* */",
        mode: "update",
        actorUserId: undefined,
      });
    });

    it("maps NameMismatchError to 409 with structured body", async () => {
      service.publish.mockRejectedValue(
        new NameMismatchError("my-node", "different-node"),
      );
      await expect(
        controller.update("my-node", { script: "/* */" }, makeReq("g-1")),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("maps DynamicNodeNotFoundError to 404 NotFoundException", async () => {
      service.publish.mockRejectedValue(
        new DynamicNodeNotFoundError("unknown"),
      );
      await expect(
        controller.update("unknown", { script: "/* */" }, makeReq("g-1")),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("list (GET)", () => {
    it("returns sorted items with versionCount + usedInWorkflowCount", async () => {
      repository.listForGroup.mockResolvedValue([
        {
          id: "dn-1",
          slug: "alpha",
          groupId: "g-1",
          deletedAt: null,
          headVersion: {
            id: "dnv-1",
            versionNumber: 2,
            signature: SAMPLE_SIGNATURE,
            publishedAt: new Date("2026-05-25T10:00:00Z"),
          },
          _count: { versions: 2 },
        },
      ]);
      repository.countWorkflowsReferencingSlug.mockResolvedValueOnce(3);
      const res = await controller.list(makeReq("g-1"));
      expect(res.items).toHaveLength(1);
      expect(res.items[0]).toEqual({
        slug: "alpha",
        headVersion: {
          versionNumber: 2,
          signature: SAMPLE_SIGNATURE,
          publishedAt: "2026-05-25T10:00:00.000Z",
        },
        versionCount: 2,
        usedInWorkflowCount: 3,
      });
    });

    it("empties out cleanly when the group has no lineages", async () => {
      repository.listForGroup.mockResolvedValue([]);
      const res = await controller.list(makeReq("g-1"));
      expect(res.items).toEqual([]);
    });
  });

  describe("detail (GET :slug)", () => {
    it("returns full version history newest-first with script bodies", async () => {
      repository.findBySlugForGroup.mockResolvedValue({
        id: "dn-1",
        slug: "my-node",
        groupId: "g-1",
        headVersion: {
          id: "dnv-2",
          versionNumber: 2,
          signature: SAMPLE_SIGNATURE,
          publishedAt: new Date("2026-05-25T11:00:00Z"),
        },
        versions: [
          {
            id: "dnv-2",
            versionNumber: 2,
            script: "/* v2 */",
            signature: SAMPLE_SIGNATURE,
            allowNet: [],
            deterministic: false,
            publishedAt: new Date("2026-05-25T11:00:00Z"),
            publishedByUserId: null,
          },
          {
            id: "dnv-1",
            versionNumber: 1,
            script: "/* v1 */",
            signature: SAMPLE_SIGNATURE,
            allowNet: [],
            deterministic: false,
            publishedAt: new Date("2026-05-25T10:00:00Z"),
            publishedByUserId: "u-1",
          },
        ],
      });
      const res = await controller.detail("my-node", undefined, makeReq("g-1"));
      expect(res.slug).toBe("my-node");
      expect(res.versions).toHaveLength(2);
      expect(res.versions[0].versionNumber).toBe(2);
      expect(res.versions[1].versionNumber).toBe(1);
      expect(res.versions[1].publishedByUserId).toBe("u-1");
    });

    it("404 on unknown slug", async () => {
      repository.findBySlugForGroup.mockResolvedValue(null);
      await expect(
        controller.detail("missing", undefined, makeReq("g-1")),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("404 on soft-deleted slug (findBySlugForGroup returns null for those)", async () => {
      repository.findBySlugForGroup.mockResolvedValue(null);
      await expect(
        controller.detail("deleted-node", undefined, makeReq("g-1")),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("delete (DELETE :slug)", () => {
    it("returns 200 with deletedAt + usedInWorkflowCount on success", async () => {
      const deletedAt = new Date("2026-05-25T12:00:00Z");
      repository.softDelete.mockResolvedValue({
        id: "dn-1",
        slug: "my-node",
        deletedAt,
      });
      repository.countWorkflowsReferencingSlug.mockResolvedValueOnce(2);
      const res = await controller.delete("my-node", makeReq("g-1"));
      expect(res).toEqual({
        slug: "my-node",
        deletedAt: deletedAt.toISOString(),
        usedInWorkflowCount: 2,
      });
    });

    it("404 on unknown slug", async () => {
      repository.softDelete.mockRejectedValue(
        new DynamicNodeNotFoundError("missing"),
      );
      await expect(
        controller.delete("missing", makeReq("g-1")),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("is idempotent — re-delete returns the original deletedAt", async () => {
      const deletedAt = new Date("2026-05-25T12:00:00Z");
      repository.softDelete.mockResolvedValue({
        id: "dn-1",
        slug: "my-node",
        deletedAt,
      });
      repository.countWorkflowsReferencingSlug.mockResolvedValue(0);
      const first = await controller.delete("my-node", makeReq("g-1"));
      const second = await controller.delete("my-node", makeReq("g-1"));
      expect(first.deletedAt).toEqual(second.deletedAt);
    });
  });

  describe("group scoping", () => {
    it("rejects callers with no group membership (400)", async () => {
      const req = {
        resolvedIdentity: {
          isSystemAdmin: false,
          groupRoles: {},
          actorId: "actor-1",
        },
      } as unknown as Request;
      await expect(
        controller.create({ script: "/* */" }, req),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects callers with multiple groups (400) — no disambiguation in 6.0", async () => {
      const req = {
        resolvedIdentity: {
          isSystemAdmin: false,
          groupRoles: { "g-1": "MEMBER", "g-2": "MEMBER" },
          actorId: "actor-1",
        },
      } as unknown as Request;
      await expect(
        controller.create({ script: "/* */" }, req),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects system-admin callers without explicit group context (400)", async () => {
      const req = {
        resolvedIdentity: {
          isSystemAdmin: true,
          groupRoles: {},
          actorId: "actor-1",
        },
      } as unknown as Request;
      await expect(
        controller.create({ script: "/* */" }, req),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ---------------------------------------------------------------------
  // US-173 Scenario 4 — POST/PUT/DELETE invalidate the per-group cache
  // ---------------------------------------------------------------------
  describe("catalog cache invalidation (US-173 Scenario 4)", () => {
    it("POST success invalidates the calling group's catalog cache", async () => {
      service.publish.mockResolvedValue({
        slug: "my-node",
        version: 1,
        signature: SAMPLE_SIGNATURE,
      });
      await controller.create({ script: "/* */" }, makeReq("g-1"));
      expect(service.invalidateGroupCatalogCache).toHaveBeenCalledWith("g-1");
    });

    it("POST failure does NOT invalidate the cache", async () => {
      service.publish.mockRejectedValue(
        new PublishValidationError([
          { stage: "ts-check", line: 1, column: 1, message: "boom" },
        ]),
      );
      await expect(
        controller.create({ script: "/* */" }, makeReq("g-1")),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(service.invalidateGroupCatalogCache).not.toHaveBeenCalled();
    });

    it("PUT success invalidates the calling group's catalog cache", async () => {
      service.publish.mockResolvedValue({
        slug: "my-node",
        version: 4,
        signature: SAMPLE_SIGNATURE,
      });
      await controller.update("my-node", { script: "/* */" }, makeReq("g-7"));
      expect(service.invalidateGroupCatalogCache).toHaveBeenCalledWith("g-7");
    });

    it("PUT failure does NOT invalidate the cache", async () => {
      service.publish.mockRejectedValue(
        new DynamicNodeNotFoundError("missing"),
      );
      await expect(
        controller.update("missing", { script: "/* */" }, makeReq("g-1")),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(service.invalidateGroupCatalogCache).not.toHaveBeenCalled();
    });

    it("DELETE success invalidates the calling group's catalog cache", async () => {
      const deletedAt = new Date("2026-05-25T12:00:00Z");
      repository.softDelete.mockResolvedValue({
        id: "dn-1",
        slug: "my-node",
        deletedAt,
      });
      await controller.delete("my-node", makeReq("g-9"));
      expect(service.invalidateGroupCatalogCache).toHaveBeenCalledWith("g-9");
    });

    it("DELETE failure does NOT invalidate the cache", async () => {
      repository.softDelete.mockRejectedValue(
        new DynamicNodeNotFoundError("missing"),
      );
      await expect(
        controller.delete("missing", makeReq("g-1")),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(service.invalidateGroupCatalogCache).not.toHaveBeenCalled();
    });
  });
});
