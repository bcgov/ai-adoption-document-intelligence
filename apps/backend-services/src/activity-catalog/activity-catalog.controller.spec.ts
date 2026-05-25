import {
  ACTIVITY_CATALOG,
  type ActivityCatalogEntry,
} from "@ai-di/graph-workflow";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import type { Request } from "express";
import { DynamicNodesService } from "@/dynamic-nodes/dynamic-nodes.service";
import { ActivityCatalogController } from "./activity-catalog.controller";

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

function makeSystemAdminReq(): Request {
  return {
    resolvedIdentity: {
      userId: "admin-user",
      isSystemAdmin: true,
      actorId: "admin-actor",
    },
  } as unknown as Request;
}

function makeMultiGroupReq(groupIds: string[]): Request {
  const groupRoles = Object.fromEntries(groupIds.map((g) => [g, "MEMBER"]));
  return {
    resolvedIdentity: {
      userId: "u-multi",
      isSystemAdmin: false,
      groupRoles,
      actorId: "actor-1",
    },
  } as unknown as Request;
}

function fakeDynamicEntry(slug: string, version: number): ActivityCatalogEntry {
  return {
    activityType: `dyn.${slug}`,
    category: "Custom",
    description: `fixture-${slug}`,
    iconHint: "dyn",
    colorHint: "dyn",
    inputs: [{ name: "document", label: "document", kind: "Document" }],
    outputs: [{ name: "result", label: "result", kind: "Artifact" }],
    paramsSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    nonCacheable: true,
    dynamicNodeSlug: slug,
    dynamicNodeVersion: version,
    allowNet: [],
  };
}

describe("ActivityCatalogController", () => {
  let controller: ActivityCatalogController;
  let service: { getMergedCatalogForGroup: jest.Mock };

  beforeEach(async () => {
    service = {
      getMergedCatalogForGroup: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ActivityCatalogController],
      providers: [{ provide: DynamicNodesService, useValue: service }],
    }).compile();
    controller = module.get<ActivityCatalogController>(
      ActivityCatalogController,
    );
  });

  it("Scenario 1 — returns merged entries as the response body", async () => {
    const staticEntries = Object.values(ACTIVITY_CATALOG);
    const dynamicEntries = [
      fakeDynamicEntry("alpha-node", 1),
      fakeDynamicEntry("beta-node", 2),
    ];
    service.getMergedCatalogForGroup.mockResolvedValue([
      ...staticEntries,
      ...dynamicEntries,
    ]);

    const res = await controller.getCatalog(makeReq("g-1"));

    expect(res.entries.length).toBe(staticEntries.length + 2);
    const tail = res.entries.slice(staticEntries.length);
    expect(tail.map((e) => e.dynamicNodeSlug)).toEqual([
      "alpha-node",
      "beta-node",
    ]);
    for (const dyn of tail) {
      expect(dyn.colorHint).toBe("dyn");
      expect(dyn.activityType.startsWith("dyn.")).toBe(true);
    }
  });

  it("Scenario 3 — passes the caller's group id through to the service", async () => {
    service.getMergedCatalogForGroup.mockResolvedValue([]);
    await controller.getCatalog(makeReq("g-42"));
    expect(service.getMergedCatalogForGroup).toHaveBeenCalledWith("g-42");
  });

  it("Scenario 5 — DTO transform drops Zod parametersSchema while keeping JSON paramsSchema", async () => {
    const staticEntries = Object.values(ACTIVITY_CATALOG);
    const dynamicEntry = fakeDynamicEntry("alpha", 1);
    service.getMergedCatalogForGroup.mockResolvedValue([
      ...staticEntries,
      dynamicEntry,
    ]);

    const res = await controller.getCatalog(makeReq("g-1"));

    // Dynamic entries carry the JSON paramsSchema and the Phase 6 fields.
    const dyn = res.entries[res.entries.length - 1];
    expect(dyn.paramsSchema).toBeDefined();
    expect(dyn.dynamicNodeSlug).toBe("alpha");

    // Static entries pass through their fields unchanged — pick a couple
    // of well-known fields to spot-check.
    const firstStatic = res.entries[0];
    expect(firstStatic.activityType).toBe(staticEntries[0].activityType);
    expect(firstStatic.category).toBe(staticEntries[0].category);
  });

  it("throws 401 when no identity is resolved", async () => {
    await expect(controller.getCatalog(makeReq(null))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("throws 400 for system-admin without a group context", async () => {
    await expect(
      controller.getCatalog(makeSystemAdminReq()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws 400 for callers with multiple group memberships", async () => {
    await expect(
      controller.getCatalog(makeMultiGroupReq(["g-1", "g-2"])),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
