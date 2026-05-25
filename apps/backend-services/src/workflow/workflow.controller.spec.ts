import { GroupRole } from "@generated/client";
import { ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { WorkflowNotFoundError } from "@temporalio/client";
import { Request } from "express";
import { z } from "zod/v4";
import { ActivityOutputCacheRepository } from "@/cache/activity-output-cache.repository";
import { AppLoggerService } from "@/logging/app-logger.service";
import { TemporalClientService } from "@/temporal/temporal-client.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import type {
  GraphWorkflowConfig,
  SourceCatalogEntry,
} from "./graph-workflow-types";
import { SourceUploadService } from "./source-upload.service";
import { WorkflowController } from "./workflow.controller";
import {
  CreateWorkflowDto,
  WorkflowInfo,
  WorkflowService,
} from "./workflow.service";

// ---------------------------------------------------------------------------
// US-112 — synthetic source catalog injection
//
// The real `source.api` / `source.upload` catalog entries land in
// US-115 / US-116. Until then, this spec swaps the package-level
// `getSourceCatalogEntry` with a controllable lookup so the
// `/run-spec` handler can exercise the source-aware paths
// (`buildUploadSpec` + `deriveInputSchema`'s source.api precedence) in
// isolation. Each test that needs catalog entries sets the per-test
// registry via `setSourceCatalog([...])`.
// ---------------------------------------------------------------------------
let testSourceCatalog: SourceCatalogEntry[] = [];

const setSourceCatalog = (entries: SourceCatalogEntry[]): void => {
  testSourceCatalog = entries;
};

jest.mock("@ai-di/graph-workflow", () => {
  const actual = jest.requireActual<typeof import("@ai-di/graph-workflow")>(
    "@ai-di/graph-workflow",
  );
  return {
    ...actual,
    getSourceCatalogEntry: (sourceType: string) =>
      testSourceCatalog.find((entry) => entry.type === sourceType),
  };
});

const mockGraphConfig: GraphWorkflowConfig = {
  schemaVersion: "1.0",
  metadata: { description: "Test graph" },
  entryNodeId: "start",
  ctx: { documentId: { type: "string" } },
  nodes: {
    start: {
      id: "start",
      type: "activity",
      label: "Start",
      activityType: "document.updateStatus",
      inputs: [{ port: "documentId", ctxKey: "documentId" }],
    },
  },
  edges: [],
};

const mockWorkflowInfo: WorkflowInfo = {
  id: "wf-1",
  workflowVersionId: "wv-wf-1",
  slug: "test-workflow",
  name: "Test Workflow",
  description: "Description",
  actorId: "user-1",
  groupId: "group-1",
  config: mockGraphConfig,
  schemaVersion: "1.0",
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function identityWithGroups(
  groups: Record<string, GroupRole>,
): Request["resolvedIdentity"] {
  return {
    isSystemAdmin: false,
    groupRoles: groups,
    actorId: "user-1",
  };
}

describe("WorkflowController", () => {
  let controller: WorkflowController;
  let workflowService: jest.Mocked<WorkflowService>;
  let temporalClient: jest.Mocked<TemporalClientService>;
  let sourceUploadService: jest.Mocked<SourceUploadService>;
  let activityOutputCache: jest.Mocked<ActivityOutputCacheRepository>;

  beforeEach(async () => {
    workflowService = {
      getGroupWorkflows: jest.fn(),
      getAllWorkflowLineages: jest.fn(),
      getWorkflow: jest.fn(),
      getWorkflowVersionById: jest.fn(),
      resolveLineageAndVersion: jest.fn(),
      listVersions: jest.fn(),
      createWorkflow: jest.fn(),
      updateWorkflow: jest.fn(),
      deleteWorkflow: jest.fn(),
      revertHeadToVersion: jest.fn(),
      cancelInFlightTriesForLineage: jest
        .fn()
        .mockResolvedValue({ cancelledCount: 0 }),
    } as unknown as jest.Mocked<WorkflowService>;

    temporalClient = {
      startGraphWorkflow: jest.fn().mockResolvedValue("graph-adhoc-fake-run"),
      queryNodeStatuses: jest.fn(),
      getRunWindow: jest.fn(),
      getRunInput: jest.fn(),
      listRunningInLineage: jest.fn().mockResolvedValue([]),
      cancelRun: jest.fn().mockResolvedValue(undefined),
      countRunsForVersion: jest.fn().mockResolvedValue(0),
      listRunsForWorkflow: jest
        .fn()
        .mockResolvedValue({ executions: [], nextCursor: null }),
    } as unknown as jest.Mocked<TemporalClientService>;

    sourceUploadService = {
      uploadFileForSource: jest.fn(),
    } as unknown as jest.Mocked<SourceUploadService>;

    activityOutputCache = {
      findFresh: jest.fn(),
      findMostRecentFresh: jest.fn(),
      findInRunWindow: jest.fn(),
      upsert: jest.fn(),
      deleteExpired: jest.fn(),
    } as unknown as jest.Mocked<ActivityOutputCacheRepository>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowController],
      providers: [
        {
          provide: WorkflowService,
          useValue: workflowService,
        },
        {
          provide: TemporalClientService,
          useValue: temporalClient,
        },
        {
          provide: AppLoggerService,
          useValue: mockAppLogger,
        },
        {
          provide: SourceUploadService,
          useValue: sourceUploadService,
        },
        {
          provide: ActivityOutputCacheRepository,
          useValue: activityOutputCache,
        },
      ],
    }).compile();

    controller = module.get<WorkflowController>(WorkflowController);
  });

  describe("getWorkflows", () => {
    it("returns empty array when no identity is set", async () => {
      const req = { resolvedIdentity: undefined } as unknown as Request;
      const result = await controller.getWorkflows(
        undefined,
        undefined,
        undefined,
        req,
      );
      expect(result).toEqual({ workflows: [] });
      expect(workflowService.getGroupWorkflows).not.toHaveBeenCalled();
    });

    it("returns empty array when identity has no group access", async () => {
      const req = {
        resolvedIdentity: identityWithGroups({}),
      } as Request;
      workflowService.getGroupWorkflows.mockResolvedValue([]);
      const result = await controller.getWorkflows(
        undefined,
        undefined,
        undefined,
        req,
      );
      expect(result).toEqual({ workflows: [] });
      expect(workflowService.getGroupWorkflows).not.toHaveBeenCalledWith(
        undefined,
      );
    });

    it("returns workflows for the user's groups", async () => {
      const req = {
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      } as Request;
      workflowService.getGroupWorkflows.mockResolvedValue([mockWorkflowInfo]);
      const result = await controller.getWorkflows(
        undefined,
        undefined,
        undefined,
        req,
      );
      expect(result).toEqual({ workflows: [mockWorkflowInfo] });
      expect(workflowService.getGroupWorkflows).toHaveBeenCalledWith(
        ["group-1"],
        { includeBenchmarkCandidates: false, kind: undefined },
      );
    });

    it("lists all lineages for system admin", async () => {
      const req = {
        resolvedIdentity: {
          isSystemAdmin: true,
          groupRoles: {},
          actorId: "admin-1",
        },
      } as Request;
      workflowService.getAllWorkflowLineages.mockResolvedValue([
        mockWorkflowInfo,
      ]);
      const result = await controller.getWorkflows(
        undefined,
        undefined,
        undefined,
        req,
      );
      expect(result).toEqual({ workflows: [mockWorkflowInfo] });
      expect(workflowService.getAllWorkflowLineages).toHaveBeenCalledWith({
        includeBenchmarkCandidates: false,
        kind: undefined,
      });
    });

    it("includes benchmark candidates when flag is true", async () => {
      const req = {
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      } as Request;
      workflowService.getGroupWorkflows.mockResolvedValue([mockWorkflowInfo]);
      const result = await controller.getWorkflows(
        undefined,
        "true",
        undefined,
        req,
      );
      expect(result).toEqual({ workflows: [mockWorkflowInfo] });
      expect(workflowService.getGroupWorkflows).toHaveBeenCalledWith(
        ["group-1"],
        { includeBenchmarkCandidates: true, kind: undefined },
      );
    });

    it("filters by groupId when groupId query param is provided", async () => {
      const req = {
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      } as Request;
      workflowService.getGroupWorkflows.mockResolvedValue([mockWorkflowInfo]);
      const result = await controller.getWorkflows(
        "group-1",
        undefined,
        undefined,
        req,
      );
      expect(result).toEqual({ workflows: [mockWorkflowInfo] });
      expect(workflowService.getGroupWorkflows).toHaveBeenCalledWith(
        ["group-1"],
        { includeBenchmarkCandidates: false, kind: undefined },
      );
    });

    it("forwards kind=library to the service", async () => {
      const req = {
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      } as Request;
      workflowService.getGroupWorkflows.mockResolvedValue([mockWorkflowInfo]);
      await controller.getWorkflows(undefined, undefined, "library", req);
      expect(workflowService.getGroupWorkflows).toHaveBeenCalledWith(
        ["group-1"],
        { includeBenchmarkCandidates: false, kind: "library" },
      );
    });

    it("forwards kind=workflow to the service", async () => {
      const req = {
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      } as Request;
      workflowService.getGroupWorkflows.mockResolvedValue([mockWorkflowInfo]);
      await controller.getWorkflows(undefined, undefined, "workflow", req);
      expect(workflowService.getGroupWorkflows).toHaveBeenCalledWith(
        ["group-1"],
        { includeBenchmarkCandidates: false, kind: "workflow" },
      );
    });

    it("rejects invalid kind values with BadRequestException", async () => {
      const req = {
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      } as Request;
      await expect(
        controller.getWorkflows(undefined, undefined, "garbage", req),
      ).rejects.toThrow(/Invalid 'kind' value/);
      expect(workflowService.getGroupWorkflows).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when groupId is provided but identity cannot access it", async () => {
      const req = {
        resolvedIdentity: identityWithGroups({
          "other-group": GroupRole.MEMBER,
        }),
      } as Request;
      await expect(
        controller.getWorkflows("group-1", undefined, undefined, req),
      ).rejects.toThrow(ForbiddenException);
      expect(workflowService.getGroupWorkflows).not.toHaveBeenCalled();
    });
  });

  describe("getWorkflow", () => {
    it("returns workflow by id for a group member", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      } as Request;
      workflowService.getWorkflow.mockResolvedValue(mockWorkflowInfo);
      const result = await controller.getWorkflow("wf-1", req);
      expect(result).toEqual({ workflow: mockWorkflowInfo });
      expect(workflowService.getWorkflow).toHaveBeenCalledWith(
        "wf-1",
        "user-1",
      );
    });

    it("throws ForbiddenException when user cannot access workflow group", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: identityWithGroups({
          "other-group": GroupRole.MEMBER,
        }),
      } as Request;
      workflowService.getWorkflow.mockResolvedValue(mockWorkflowInfo);
      await expect(controller.getWorkflow("wf-1", req)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("getVersion", () => {
    const mockReq = () =>
      ({
        user: { sub: "user-1" },
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      }) as Request;

    // US-079 Scenario 1: happy path — returns the version's WorkflowInfo
    it("returns the WorkflowInfo for the requested version when version belongs to the lineage", async () => {
      const v2WorkflowInfo: WorkflowInfo = {
        ...mockWorkflowInfo,
        workflowVersionId: "wv-v2",
        version: 2,
      };
      workflowService.getWorkflowVersionById.mockResolvedValue(v2WorkflowInfo);

      const result = await controller.getVersion("wf-1", "wv-v2", mockReq());

      expect(result).toEqual({ workflow: v2WorkflowInfo });
      expect(result.workflow.workflowVersionId).toBe("wv-v2");
      expect(result.workflow.config).toEqual(mockGraphConfig);
      expect(workflowService.getWorkflowVersionById).toHaveBeenCalledWith(
        "wv-v2",
      );
    });

    // US-079 Scenario 2: unknown version id → 404
    it("throws NotFoundException when the version id does not exist", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      workflowService.getWorkflowVersionById.mockResolvedValue(null);

      await expect(
        controller.getVersion("wf-1", "wv-missing", mockReq()),
      ).rejects.toThrow(NotFoundException);
      expect(workflowService.getWorkflowVersionById).toHaveBeenCalledWith(
        "wv-missing",
      );
    });

    // US-079 Scenario 3: cross-lineage version id → 404 (preferred over 400)
    it("throws NotFoundException when the version belongs to a different lineage", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      const otherLineageWorkflow: WorkflowInfo = {
        ...mockWorkflowInfo,
        id: "wf-other",
        workflowVersionId: "wv-other",
      };
      workflowService.getWorkflowVersionById.mockResolvedValue(
        otherLineageWorkflow,
      );

      await expect(
        controller.getVersion("wf-1", "wv-other", mockReq()),
      ).rejects.toThrow(NotFoundException);
      expect(workflowService.getWorkflowVersionById).toHaveBeenCalledWith(
        "wv-other",
      );
    });

    // US-079 Scenario 4: authorization — non-member of the group → 403
    // (401 — missing x-api-key — is enforced by the @Identity guard upstream of
    // the controller method and is exercised by the auth-pipeline e2e suite;
    // here we cover the in-controller forbidden path.)
    it("throws ForbiddenException when caller is not a member of the workflow's group", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: identityWithGroups({
          "other-group": GroupRole.MEMBER,
        }),
      } as Request;
      workflowService.getWorkflowVersionById.mockResolvedValue(
        mockWorkflowInfo,
      );

      await expect(
        controller.getVersion("wf-1", "wv-wf-1", req),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("getRunSpec", () => {
    const mockReq = () =>
      ({
        protocol: "http",
        headers: { host: "localhost:3002" },
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      }) as unknown as Request;

    it("returns a run-spec with trigger URL + schema derived from ctx isInput", async () => {
      const wfWithInput: WorkflowInfo = {
        ...mockWorkflowInfo,
        config: {
          ...mockGraphConfig,
          ctx: {
            customerId: {
              type: "string",
              isInput: true,
              description: "Customer to process",
            },
            internalCounter: { type: "number" },
          },
        },
      };
      workflowService.resolveLineageAndVersion.mockResolvedValue(wfWithInput);

      const result = await controller.getRunSpec("wf-1", undefined, mockReq());

      expect(result.triggerUrl).toBe(
        "http://localhost:3002/api/workflows/wf-1/runs",
      );
      expect(Object.keys(result.inputSchema.properties)).toEqual([
        "customerId",
      ]);
      expect(result.inputSchema.required).toEqual(["customerId"]);
      expect(result.authNotes).toMatch(/x-api-key/);
      expect(result.sampleCurl).toContain("wf-1/runs");
      expect(workflowService.resolveLineageAndVersion).toHaveBeenCalledWith(
        "wf-1",
        undefined,
      );
    });

    it("derives the schema from metadata.inputs[] for a library workflow", async () => {
      const libWf: WorkflowInfo = {
        ...mockWorkflowInfo,
        config: {
          ...mockGraphConfig,
          metadata: {
            kind: "library",
            inputs: [{ label: "Foo", path: "foo", type: "string" }],
          },
        },
      };
      workflowService.resolveLineageAndVersion.mockResolvedValue(libWf);

      const result = await controller.getRunSpec("wf-1", undefined, mockReq());

      expect(result.inputSchema.properties.foo).toEqual({
        type: "string",
        title: "Foo",
      });
      expect(result.inputSchema.required).toEqual(["foo"]);
    });

    it("propagates NotFoundException from the service", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      workflowService.resolveLineageAndVersion.mockRejectedValue(
        new NotFoundException("Workflow not found: missing"),
      );

      await expect(
        controller.getRunSpec("missing", undefined, mockReq()),
      ).rejects.toThrow(NotFoundException);
    });

    it("propagates ConflictException when the workflow has no published version", async () => {
      const { ConflictException } = await import("@nestjs/common");
      workflowService.resolveLineageAndVersion.mockRejectedValue(
        new ConflictException("Workflow has no published version yet"),
      );

      await expect(
        controller.getRunSpec("draft-only", undefined, mockReq()),
      ).rejects.toThrow(ConflictException);
    });

    it("throws ForbiddenException when caller cannot access the workflow's group", async () => {
      const req = {
        protocol: "http",
        headers: { host: "localhost:3002" },
        resolvedIdentity: identityWithGroups({
          "other-group": GroupRole.MEMBER,
        }),
      } as unknown as Request;
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );

      await expect(
        controller.getRunSpec("wf-1", undefined, req),
      ).rejects.toThrow(ForbiddenException);
    });

    // US-077 Scenario 1: ?workflowVersionId=<v2id> returns spec derived from v2
    it("derives the spec from the requested workflowVersionId (NOT head) when query param is provided", async () => {
      const v2Wf: WorkflowInfo = {
        ...mockWorkflowInfo,
        workflowVersionId: "wv-v2",
        version: 2,
        config: {
          ...mockGraphConfig,
          ctx: {
            v2OnlyInput: {
              type: "string",
              isInput: true,
              description: "Only present in v2",
            },
          },
        },
      };
      workflowService.resolveLineageAndVersion.mockResolvedValue(v2Wf);

      const result = await controller.getRunSpec("wf-1", "wv-v2", mockReq());

      expect(workflowService.resolveLineageAndVersion).toHaveBeenCalledWith(
        "wf-1",
        "wv-v2",
      );
      expect(Object.keys(result.inputSchema.properties)).toEqual([
        "v2OnlyInput",
      ]);
      expect(result.inputSchema.required).toEqual(["v2OnlyInput"]);
      // triggerUrl and authNotes unchanged
      expect(result.triggerUrl).toBe(
        "http://localhost:3002/api/workflows/wf-1/runs",
      );
      expect(result.authNotes).toMatch(/x-api-key/);
    });

    // US-077 Scenario 2 — covered by the existing "returns a run-spec..." test
    // above (omitting param resolves head via resolveLineageAndVersion(id,
    // undefined)). Kept as a named alias for traceability.
    it("(regression) without workflowVersionId resolves the lineage's head", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );

      await controller.getRunSpec("wf-1", undefined, mockReq());

      expect(workflowService.resolveLineageAndVersion).toHaveBeenCalledWith(
        "wf-1",
        undefined,
      );
    });

    // US-077 Scenario 3: unknown workflowVersionId → 404
    it("propagates NotFoundException for an unknown workflowVersionId", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      workflowService.resolveLineageAndVersion.mockRejectedValue(
        new NotFoundException("Workflow version not found: wv-missing"),
      );

      await expect(
        controller.getRunSpec("wf-1", "wv-missing", mockReq()),
      ).rejects.toThrow(NotFoundException);
      expect(workflowService.resolveLineageAndVersion).toHaveBeenCalledWith(
        "wf-1",
        "wv-missing",
      );
    });

    // US-077 Scenario 4: cross-lineage workflowVersionId → 400
    it("propagates BadRequestException when workflowVersionId belongs to a different lineage", async () => {
      const { BadRequestException } = await import("@nestjs/common");
      workflowService.resolveLineageAndVersion.mockRejectedValue(
        new BadRequestException(
          "workflowVersionId does not belong to this workflow",
        ),
      );

      await expect(
        controller.getRunSpec("wf-1", "wv-other-lineage", mockReq()),
      ).rejects.toThrow(BadRequestException);
      expect(workflowService.resolveLineageAndVersion).toHaveBeenCalledWith(
        "wf-1",
        "wv-other-lineage",
      );
    });

    // -----------------------------------------------------------------------
    // US-112 — `uploadSpec?` extension for `source.upload`
    // -----------------------------------------------------------------------
    describe("US-112: uploadSpec extension", () => {
      // Synthetic source.upload entry — Zod schema's `.default(...)`
      // mirrors the documented DOCUMENT_SOURCES_DESIGN.md §3.2 defaults
      // and matches what US-116 will register.
      const fakeSourceUploadEntry: SourceCatalogEntry = {
        type: "source.upload",
        category: "source",
        displayName: "File upload (test)",
        description: "Synthetic source.upload entry used in controller tests",
        parametersSchema: z.object({
          allowedMimeTypes: z
            .array(z.string())
            .default(["application/pdf", "image/*"]),
          maxFileSizeMB: z.number().default(50),
          ctxKey: z.string().default("documentUrl"),
        }),
        runtime: "manual",
        outputKind: "Document",
        deriveOutputSchema: (parameters) => {
          const ctxKey =
            typeof parameters?.ctxKey === "string"
              ? parameters.ctxKey
              : "documentUrl";
          return {
            type: "object",
            properties: { [ctxKey]: { type: "string", format: "uri" } },
            required: [ctxKey],
          };
        },
      };

      // Synthetic source.api entry — minimal `fields[]` → JSON Schema
      // derivation, sufficient to exercise the `inputSchema` + `uploadSpec`
      // co-existence branch.
      const fakeSourceApiEntry: SourceCatalogEntry = {
        type: "source.api",
        category: "source",
        displayName: "API endpoint (test)",
        description: "Synthetic source.api entry used in controller tests",
        parametersSchema: z.object({}).passthrough(),
        runtime: "push",
        outputKind: "Artifact",
        deriveOutputSchema: (parameters) => {
          const fields =
            (parameters?.fields as
              | {
                  name: string;
                  type: "string" | "number" | "boolean" | "object" | "array";
                  required?: boolean;
                }[]
              | undefined) ?? [];
          const properties: Record<string, { type: string }> = {};
          const required: string[] = [];
          for (const f of fields) {
            properties[f.name] = { type: f.type };
            if (f.required) required.push(f.name);
          }
          return { type: "object", properties, required };
        },
      };

      afterEach(() => {
        setSourceCatalog([]);
      });

      it("Scenario 1: includes uploadSpec when a source.upload node exists", async () => {
        setSourceCatalog([fakeSourceUploadEntry]);
        const wf: WorkflowInfo = {
          ...mockWorkflowInfo,
          config: {
            ...mockGraphConfig,
            ctx: {},
            nodes: {
              ...mockGraphConfig.nodes,
              upload: {
                id: "upload",
                type: "source",
                label: "Upload",
                sourceType: "source.upload",
                parameters: {
                  ctxKey: "myFile",
                  allowedMimeTypes: ["application/pdf"],
                  maxFileSizeMB: 25,
                },
              },
            },
          },
        };
        workflowService.resolveLineageAndVersion.mockResolvedValue(wf);

        const result = await controller.getRunSpec(
          "wf-1",
          undefined,
          mockReq(),
        );

        expect(result.uploadSpec).toEqual({
          sourceNodeId: "upload",
          uploadUrl:
            "http://localhost:3002/api/workflows/wf-1/sources/upload/upload",
          allowedMimeTypes: ["application/pdf"],
          maxFileSizeMB: 25,
          ctxKey: "myFile",
        });
      });

      it("Scenario 1 (defaults): fills in catalog defaults when source omits parameters", async () => {
        setSourceCatalog([fakeSourceUploadEntry]);
        const wf: WorkflowInfo = {
          ...mockWorkflowInfo,
          config: {
            ...mockGraphConfig,
            ctx: {},
            nodes: {
              ...mockGraphConfig.nodes,
              upload: {
                id: "upload",
                type: "source",
                label: "Upload",
                sourceType: "source.upload",
              },
            },
          },
        };
        workflowService.resolveLineageAndVersion.mockResolvedValue(wf);

        const result = await controller.getRunSpec(
          "wf-1",
          undefined,
          mockReq(),
        );

        expect(result.uploadSpec).toEqual({
          sourceNodeId: "upload",
          uploadUrl:
            "http://localhost:3002/api/workflows/wf-1/sources/upload/upload",
          allowedMimeTypes: ["application/pdf", "image/*"],
          maxFileSizeMB: 50,
          ctxKey: "documentUrl",
        });
      });

      it("Scenario 2: omits uploadSpec entirely when no source.upload node exists", async () => {
        setSourceCatalog([]);
        const wfWithInput: WorkflowInfo = {
          ...mockWorkflowInfo,
          config: {
            ...mockGraphConfig,
            ctx: {
              customerId: { type: "string", isInput: true },
            },
          },
        };
        workflowService.resolveLineageAndVersion.mockResolvedValue(wfWithInput);

        const result = await controller.getRunSpec(
          "wf-1",
          undefined,
          mockReq(),
        );

        expect("uploadSpec" in result).toBe(false);
        expect(result.uploadSpec).toBeUndefined();
      });

      it("Scenario 3: includes BOTH inputSchema (from source.api) AND uploadSpec when both source nodes exist", async () => {
        setSourceCatalog([fakeSourceApiEntry, fakeSourceUploadEntry]);
        const wf: WorkflowInfo = {
          ...mockWorkflowInfo,
          config: {
            ...mockGraphConfig,
            ctx: {},
            nodes: {
              ...mockGraphConfig.nodes,
              api: {
                id: "api",
                type: "source",
                label: "API",
                sourceType: "source.api",
                parameters: {
                  fields: [
                    { name: "customerId", type: "string", required: true },
                  ],
                },
              },
              upload: {
                id: "upload",
                type: "source",
                label: "Upload",
                sourceType: "source.upload",
                parameters: { ctxKey: "myFile" },
              },
            },
          },
        };
        workflowService.resolveLineageAndVersion.mockResolvedValue(wf);

        const result = await controller.getRunSpec(
          "wf-1",
          undefined,
          mockReq(),
        );

        // inputSchema derived from source.api (per US-111 precedence)
        expect(Object.keys(result.inputSchema.properties)).toEqual([
          "customerId",
        ]);
        expect(result.inputSchema.required).toEqual(["customerId"]);

        // uploadSpec populated from source.upload
        expect(result.uploadSpec).toBeDefined();
        expect(result.uploadSpec?.sourceNodeId).toBe("upload");
        expect(result.uploadSpec?.ctxKey).toBe("myFile");
        expect(result.uploadSpec?.uploadUrl).toBe(
          "http://localhost:3002/api/workflows/wf-1/sources/upload/upload",
        );
        // Defaults still applied for omitted fields
        expect(result.uploadSpec?.allowedMimeTypes).toEqual([
          "application/pdf",
          "image/*",
        ]);
        expect(result.uploadSpec?.maxFileSizeMB).toBe(50);
      });
    });
  });

  describe("startRun", () => {
    const mockReq = () =>
      ({
        protocol: "http",
        headers: { host: "localhost:3002" },
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      }) as unknown as Request;

    const wfWithCustomerInput: WorkflowInfo = {
      ...mockWorkflowInfo,
      config: {
        ...mockGraphConfig,
        ctx: {
          customerId: { type: "string", isInput: true },
        },
      },
    };

    it("starts a Temporal run and returns the execution id", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        wfWithCustomerInput,
      );
      temporalClient.startGraphWorkflow.mockResolvedValue("graph-adhoc-xyz");

      const result = await controller.startRun(
        "wf-1",
        { initialCtx: { customerId: "cust-001" } },
        mockReq(),
      );

      expect(result).toEqual({
        workflowId: "graph-adhoc-xyz",
        workflowVersionId: "wv-wf-1",
        status: "started",
      });
      expect(temporalClient.startGraphWorkflow).toHaveBeenCalledWith(
        undefined,
        "wv-wf-1",
        { customerId: "cust-001" },
        "group-1",
      );
    });

    it("returns 400 when initialCtx is missing a required field", async () => {
      const { BadRequestException } = await import("@nestjs/common");
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        wfWithCustomerInput,
      );

      await expect(
        controller.startRun("wf-1", { initialCtx: {} }, mockReq()),
      ).rejects.toThrow(BadRequestException);
      expect(temporalClient.startGraphWorkflow).not.toHaveBeenCalled();
    });

    it("returns 400 when an initialCtx field has the wrong type", async () => {
      const { BadRequestException } = await import("@nestjs/common");
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        wfWithCustomerInput,
      );

      await expect(
        controller.startRun(
          "wf-1",
          { initialCtx: { customerId: 123 } },
          mockReq(),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(temporalClient.startGraphWorkflow).not.toHaveBeenCalled();
    });

    it("accepts a body with no initialCtx for a workflow with no required inputs", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo, // no ctx isInput entries
      );
      temporalClient.startGraphWorkflow.mockResolvedValue("graph-adhoc-empty");

      const result = await controller.startRun("wf-1", {}, mockReq());

      expect(result.workflowId).toBe("graph-adhoc-empty");
      expect(temporalClient.startGraphWorkflow).toHaveBeenCalledWith(
        undefined,
        "wv-wf-1",
        {},
        "group-1",
      );
    });

    it("passes through an explicit workflowVersionId", async () => {
      const olderVersion: WorkflowInfo = {
        ...mockWorkflowInfo,
        workflowVersionId: "wv-older",
        version: 3,
      };
      workflowService.resolveLineageAndVersion.mockResolvedValue(olderVersion);
      temporalClient.startGraphWorkflow.mockResolvedValue("graph-adhoc-ver");

      const result = await controller.startRun(
        "wf-1",
        { workflowVersionId: "wv-older" },
        mockReq(),
      );

      expect(workflowService.resolveLineageAndVersion).toHaveBeenCalledWith(
        "wf-1",
        "wv-older",
      );
      expect(result.workflowVersionId).toBe("wv-older");
    });

    it("throws ForbiddenException when caller cannot access the workflow's group", async () => {
      const req = {
        protocol: "http",
        headers: { host: "localhost:3002" },
        resolvedIdentity: identityWithGroups({
          "other-group": GroupRole.MEMBER,
        }),
      } as unknown as Request;
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );

      await expect(controller.startRun("wf-1", {}, req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(temporalClient.startGraphWorkflow).not.toHaveBeenCalled();
    });

    // US-078 Scenario 1: initialCtx validated against selected version's schema
    // head requires `foo`; v2 doesn't — running v2 with empty body must succeed
    it("validates initialCtx against the selected version's schema (head requires foo, v2 doesn't → empty body accepted)", async () => {
      // v2 config has no `isInput: true` ctx entries → empty body is valid for v2
      const v2NoRequiredInputs: WorkflowInfo = {
        ...mockWorkflowInfo,
        workflowVersionId: "wv-v2",
        version: 2,
        config: {
          ...mockGraphConfig,
          ctx: {
            // No isInput entries — v2 requires nothing
            internalOnly: { type: "string" },
          },
        },
      };
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        v2NoRequiredInputs,
      );
      temporalClient.startGraphWorkflow.mockResolvedValue("graph-adhoc-v2");

      const result = await controller.startRun(
        "wf-1",
        { workflowVersionId: "wv-v2", initialCtx: {} },
        mockReq(),
      );

      expect(result).toEqual({
        workflowId: "graph-adhoc-v2",
        workflowVersionId: "wv-v2",
        status: "started",
      });
      expect(workflowService.resolveLineageAndVersion).toHaveBeenCalledWith(
        "wf-1",
        "wv-v2",
      );
      expect(temporalClient.startGraphWorkflow).toHaveBeenCalledWith(
        undefined,
        "wv-v2",
        {},
        "group-1",
      );
    });

    // US-078 Scenario 2: missing-required errors raised relative to selected version
    it("returns 400 with the selected version's required-field name when initialCtx is missing it", async () => {
      const { BadRequestException } = await import("@nestjs/common");
      const v2RequiresCustomerId: WorkflowInfo = {
        ...mockWorkflowInfo,
        workflowVersionId: "wv-v2",
        version: 2,
        config: {
          ...mockGraphConfig,
          ctx: {
            customerId: { type: "string", isInput: true },
          },
        },
      };
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        v2RequiresCustomerId,
      );

      // Use a function that captures the thrown exception so we can inspect its response
      let caught: unknown;
      try {
        await controller.startRun(
          "wf-1",
          { workflowVersionId: "wv-v2", initialCtx: {} },
          mockReq(),
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(BadRequestException);
      const bre = caught as InstanceType<typeof BadRequestException>;
      const response = bre.getResponse() as {
        message: string;
        errors: Array<{ path: string; message: string }>;
      };
      expect(response.message).toBe(
        "Invalid initialCtx for this workflow's input schema",
      );
      expect(response.errors.map((e) => e.path)).toContain("customerId");
      expect(temporalClient.startGraphWorkflow).not.toHaveBeenCalled();
    });

    // US-078 Scenario 3: omitting workflowVersionId validates against head (regression)
    it("validates initialCtx against the head version's schema when workflowVersionId is omitted", async () => {
      const { BadRequestException } = await import("@nestjs/common");
      // Head requires `customerId`. Body omits it. Should fail validation.
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        wfWithCustomerInput,
      );

      await expect(
        controller.startRun("wf-1", { initialCtx: {} }, mockReq()),
      ).rejects.toThrow(BadRequestException);
      expect(workflowService.resolveLineageAndVersion).toHaveBeenCalledWith(
        "wf-1",
        undefined,
      );
      expect(temporalClient.startGraphWorkflow).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // US-149 — `POST /runs` cancels in-flight Tries for the lineage before
    // starting the new run. Mirrors US-146's upload-and-Try semantics; the
    // helper is best-effort so cancel errors never block the new run.
    // -----------------------------------------------------------------------
    it("US-149: cancels in-flight Tries for the lineage BEFORE startGraphWorkflow", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );
      temporalClient.startGraphWorkflow.mockResolvedValue("graph-adhoc-cancel");

      const callOrder: string[] = [];
      workflowService.cancelInFlightTriesForLineage.mockImplementation(
        async () => {
          callOrder.push("cancel");
          return { cancelledCount: 2 };
        },
      );
      temporalClient.startGraphWorkflow.mockImplementation(async () => {
        callOrder.push("start");
        return "graph-adhoc-cancel";
      });

      await controller.startRun("wf-1", { initialCtx: {} }, mockReq());

      expect(
        workflowService.cancelInFlightTriesForLineage,
      ).toHaveBeenCalledWith("wf-1");
      expect(callOrder).toEqual(["cancel", "start"]);
    });

    // -----------------------------------------------------------------------
    // US-113 — `POST /runs` body validation honors the Phase 8 precedence
    // (source.api > library > isInput > empty). The controller already calls
    // `deriveInputSchema(wf.config)` directly, and US-111 extended that
    // helper to honor source.api — so the precedence applies automatically.
    // These tests pin the contract: source.api drives /runs validation, the
    // legacy isInput path still works, extras are accepted (matches the
    // existing Phase 2 Track 2 semantics in `validateRunInput`), and the
    // selected workflowVersionId picks the right config to derive from.
    // -----------------------------------------------------------------------
    describe("US-113: source.api precedence drives /runs body validation", () => {
      // Synthetic source.api entry — mirrors the one used in the
      // /run-spec US-112 describe block above. Each test sets the
      // per-test registry via `setSourceCatalog([...])`.
      const fakeSourceApiEntry: SourceCatalogEntry = {
        type: "source.api",
        category: "source",
        displayName: "API endpoint (test)",
        description: "Synthetic source.api entry used in /runs tests",
        parametersSchema: z.object({}).passthrough(),
        runtime: "push",
        outputKind: "Artifact",
        deriveOutputSchema: (parameters) => {
          const fields =
            (parameters?.fields as
              | {
                  name: string;
                  type: "string" | "number" | "boolean" | "object" | "array";
                  required?: boolean;
                }[]
              | undefined) ?? [];
          const properties: Record<string, { type: string }> = {};
          const required: string[] = [];
          for (const f of fields) {
            properties[f.name] = { type: f.type };
            if (f.required) required.push(f.name);
          }
          return { type: "object", properties, required };
        },
      };

      const wfWithSourceApi = (
        fields: Array<{
          name: string;
          type: "string" | "number" | "boolean" | "object" | "array";
          required?: boolean;
        }>,
        overrides: Partial<WorkflowInfo> = {},
      ): WorkflowInfo => ({
        ...mockWorkflowInfo,
        config: {
          ...mockGraphConfig,
          ctx: {},
          nodes: {
            ...mockGraphConfig.nodes,
            api: {
              id: "api",
              type: "source",
              label: "API",
              sourceType: "source.api",
              parameters: { fields },
            },
          },
        },
        ...overrides,
      });

      afterEach(() => {
        setSourceCatalog([]);
      });

      // ---------------------------------------------------------------------
      // Scenario 1: source.api fields drive /runs validation
      // ---------------------------------------------------------------------
      it("Scenario 1: returns 400 when source.api required field is missing, succeeds when provided", async () => {
        setSourceCatalog([fakeSourceApiEntry]);
        const wf = wfWithSourceApi([
          { name: "documentUrl", type: "string", required: true },
        ]);
        workflowService.resolveLineageAndVersion.mockResolvedValue(wf);

        // Missing required `documentUrl` → 400 with `documentUrl` in errors
        const { BadRequestException } = await import("@nestjs/common");
        let caught: unknown;
        try {
          await controller.startRun("wf-1", { initialCtx: {} }, mockReq());
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(BadRequestException);
        const bre = caught as InstanceType<typeof BadRequestException>;
        const response = bre.getResponse() as {
          message: string;
          errors: Array<{ path: string; message: string }>;
        };
        expect(response.errors.map((e) => e.path)).toContain("documentUrl");
        expect(temporalClient.startGraphWorkflow).not.toHaveBeenCalled();

        // Providing the field → succeeds, starts a Temporal execution
        temporalClient.startGraphWorkflow.mockResolvedValue("graph-adhoc-doc");
        const result = await controller.startRun(
          "wf-1",
          { initialCtx: { documentUrl: "https://example.com/doc.pdf" } },
          mockReq(),
        );
        expect(result).toEqual({
          workflowId: "graph-adhoc-doc",
          workflowVersionId: "wv-wf-1",
          status: "started",
        });
        expect(temporalClient.startGraphWorkflow).toHaveBeenCalledWith(
          undefined,
          "wv-wf-1",
          { documentUrl: "https://example.com/doc.pdf" },
          "group-1",
        );
      });

      // ---------------------------------------------------------------------
      // Scenario 2: legacy `isInput` fallback unchanged
      //
      // When the workflow has NO source nodes and an `isInput`-flagged ctx
      // entry, body validation derives from `ctx[]` exactly as Phase 2
      // Track 2 — no behaviour change. The pre-existing tests above
      // ("returns 400 when initialCtx is missing a required field" and
      // "starts a Temporal run and returns the execution id") cover this
      // path against `wfWithCustomerInput`. This test re-asserts the same
      // path inside the US-113 block with the catalog empty, pinning the
      // contract that an unrelated source catalog has no effect on
      // legacy workflows.
      // ---------------------------------------------------------------------
      it("Scenario 2: legacy isInput-flagged ctx still drives validation when no source.api node exists", async () => {
        setSourceCatalog([]);
        workflowService.resolveLineageAndVersion.mockResolvedValue(
          wfWithCustomerInput,
        );

        // Missing required `customerId` → 400 (isInput path unchanged)
        const { BadRequestException } = await import("@nestjs/common");
        await expect(
          controller.startRun("wf-1", { initialCtx: {} }, mockReq()),
        ).rejects.toThrow(BadRequestException);
        expect(temporalClient.startGraphWorkflow).not.toHaveBeenCalled();

        // Providing it → succeeds
        temporalClient.startGraphWorkflow.mockResolvedValue("graph-adhoc-leg");
        const result = await controller.startRun(
          "wf-1",
          { initialCtx: { customerId: "cust-1" } },
          mockReq(),
        );
        expect(result.workflowId).toBe("graph-adhoc-leg");
      });

      // ---------------------------------------------------------------------
      // Scenario 3: source.api with 2 fields — extras coexist with the
      // declared inputs (matches `validateRunInput`'s Phase 2 Track 2
      // semantics: extras are permitted, not strict-rejected). What this
      // scenario locks in: the 2 declared source.api fields ARE what
      // drives validation — typing them correctly is required, and
      // typing them wrong still surfaces a 400 with the source.api field
      // name. Adding an additional non-declared key does not affect the
      // outcome.
      // ---------------------------------------------------------------------
      it("Scenario 3: source.api fields gate validation; extras are accepted alongside (Phase 2 Track 2 parity)", async () => {
        setSourceCatalog([fakeSourceApiEntry]);
        const wf = wfWithSourceApi([
          { name: "documentUrl", type: "string", required: true },
          { name: "priority", type: "number", required: false },
        ]);
        workflowService.resolveLineageAndVersion.mockResolvedValue(wf);

        // Wrong type for a source.api field → 400, error path is the
        // source.api field name (proves source.api drives the schema)
        const { BadRequestException } = await import("@nestjs/common");
        let caught: unknown;
        try {
          await controller.startRun(
            "wf-1",
            {
              initialCtx: {
                documentUrl: 42,
                priority: 1,
                extra: true,
              },
            },
            mockReq(),
          );
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(BadRequestException);
        const bre = caught as InstanceType<typeof BadRequestException>;
        const response = bre.getResponse() as {
          message: string;
          errors: Array<{ path: string; message: string }>;
        };
        expect(response.errors.map((e) => e.path)).toContain("documentUrl");
        expect(temporalClient.startGraphWorkflow).not.toHaveBeenCalled();

        // Body with both declared fields typed correctly + an unknown extra
        // → succeeds (extras are permitted, same as Phase 2 Track 2)
        temporalClient.startGraphWorkflow.mockResolvedValue("graph-adhoc-ex");
        const result = await controller.startRun(
          "wf-1",
          {
            initialCtx: {
              documentUrl: "https://example.com/doc.pdf",
              priority: 1,
              extra: true,
            },
          },
          mockReq(),
        );
        expect(result.workflowId).toBe("graph-adhoc-ex");
        expect(temporalClient.startGraphWorkflow).toHaveBeenCalledWith(
          undefined,
          "wv-wf-1",
          {
            documentUrl: "https://example.com/doc.pdf",
            priority: 1,
            extra: true,
          },
          "group-1",
        );
      });

      // ---------------------------------------------------------------------
      // Scenario 4: workflowVersionId pins schema derivation to THAT
      // version's config (NOT the head). The controller calls
      // `resolveLineageAndVersion(id, body.workflowVersionId)` and then
      // `deriveInputSchema(wf.config)` — so the schema follows whatever
      // config the service returns for the requested version.
      // ---------------------------------------------------------------------
      it("Scenario 4: validates against the pinned workflowVersionId's source.api (not head)", async () => {
        setSourceCatalog([fakeSourceApiEntry]);
        // v1 declares a `documentUrl: string/required` source.api field.
        // Head (v2, not exercised here) might differ — the test pins the
        // contract that the schema comes from THIS version's config.
        const v1 = wfWithSourceApi(
          [{ name: "documentUrl", type: "string", required: true }],
          { workflowVersionId: "wv-v1", version: 1 },
        );
        workflowService.resolveLineageAndVersion.mockResolvedValue(v1);
        temporalClient.startGraphWorkflow.mockResolvedValue("graph-adhoc-v1");

        const result = await controller.startRun(
          "wf-1",
          {
            workflowVersionId: "wv-v1",
            initialCtx: { documentUrl: "https://example.com/v1.pdf" },
          },
          mockReq(),
        );

        // Service was asked for v1, NOT head
        expect(workflowService.resolveLineageAndVersion).toHaveBeenCalledWith(
          "wf-1",
          "wv-v1",
        );
        // Temporal execution pinned to v1
        expect(result).toEqual({
          workflowId: "graph-adhoc-v1",
          workflowVersionId: "wv-v1",
          status: "started",
        });
        expect(temporalClient.startGraphWorkflow).toHaveBeenCalledWith(
          undefined,
          "wv-v1",
          { documentUrl: "https://example.com/v1.pdf" },
          "group-1",
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  // US-114 — `POST /:id/sources/:sourceNodeId/upload` multipart endpoint
  // ---------------------------------------------------------------------------
  describe("uploadToSource (US-114)", () => {
    const mockReq = () =>
      ({
        protocol: "http",
        headers: { host: "localhost:3002" },
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      }) as unknown as Request;

    // Synthetic source.upload catalog entry — same shape as US-112/113
    // tests; defaults match DOCUMENT_SOURCES_DESIGN.md §3.2.
    const fakeSourceUploadEntry: SourceCatalogEntry = {
      type: "source.upload",
      category: "source",
      displayName: "File upload (test)",
      description: "Synthetic source.upload entry used in controller tests",
      parametersSchema: z.object({
        allowedMimeTypes: z
          .array(z.string())
          .default(["application/pdf", "image/*"]),
        maxFileSizeMB: z.number().default(50),
        ctxKey: z.string().default("documentUrl"),
      }),
      runtime: "manual",
      outputKind: "Document",
      deriveOutputSchema: (parameters) => {
        const ctxKey =
          typeof parameters?.ctxKey === "string"
            ? parameters.ctxKey
            : "documentUrl";
        return {
          type: "object",
          properties: { [ctxKey]: { type: "string", format: "uri" } },
          required: [ctxKey],
        };
      },
    };

    // Synthetic source.api catalog entry — used by Scenario 3 (wrong
    // subtype) to populate a source.api node and verify the controller
    // 400s when the URL points at it.
    const fakeSourceApiEntry: SourceCatalogEntry = {
      type: "source.api",
      category: "source",
      displayName: "API endpoint (test)",
      description: "Synthetic source.api entry used in controller tests",
      parametersSchema: z.object({}).passthrough(),
      runtime: "push",
      outputKind: "Artifact",
      deriveOutputSchema: () => ({ type: "object", properties: {} }),
    };

    const makeFile = (
      overrides: Partial<Express.Multer.File> = {},
    ): Express.Multer.File =>
      ({
        fieldname: "file",
        originalname: "doc.pdf",
        encoding: "7bit",
        mimetype: "application/pdf",
        buffer: Buffer.from("pdf payload"),
        size: 1024 * 1024, // 1MB
        stream: undefined as unknown as Express.Multer.File["stream"],
        destination: "",
        filename: "",
        path: "",
        ...overrides,
      }) as Express.Multer.File;

    afterEach(() => {
      setSourceCatalog([]);
    });

    // -------------------------------------------------------------------
    // Scenario 1: Happy-path upload returns ctxKey-keyed response
    // -------------------------------------------------------------------
    it("Scenario 1: returns { [ctxKey]: <blobKey>, runId, workflowVersionId } on a successful upload-and-Try", async () => {
      setSourceCatalog([fakeSourceUploadEntry]);
      const wf: WorkflowInfo = {
        ...mockWorkflowInfo,
        config: {
          ...mockGraphConfig,
          nodes: {
            ...mockGraphConfig.nodes,
            upload: {
              id: "upload",
              type: "source",
              label: "Upload",
              sourceType: "source.upload",
              parameters: {
                ctxKey: "myFile",
                allowedMimeTypes: ["application/pdf"],
                maxFileSizeMB: 25,
              },
            },
          },
        },
      };
      workflowService.resolveLineageAndVersion.mockResolvedValue(wf);
      sourceUploadService.uploadFileForSource.mockResolvedValue(
        "group-1/ocr/workflow-uploads/wf-1/upload/some-uuid-doc.pdf",
      );
      temporalClient.startGraphWorkflow.mockResolvedValue(
        "graph-adhoc-the-new-run",
      );

      const file = makeFile();
      const result = await controller.uploadToSource(
        "wf-1",
        "upload",
        file,
        mockReq(),
      );

      // Three keys: the dynamic ctxKey-keyed entry + the two fixed
      // US-146 fields. Use sets to ignore ordering.
      expect(new Set(Object.keys(result))).toEqual(
        new Set(["myFile", "runId", "workflowVersionId"]),
      );
      expect(result["myFile"]).toBe(
        "group-1/ocr/workflow-uploads/wf-1/upload/some-uuid-doc.pdf",
      );
      expect(result.runId).toBe("graph-adhoc-the-new-run");
      expect(result.workflowVersionId).toBe(wf.workflowVersionId);

      // SourceUploadService received the file payload, the resolved
      // (defaults-merged) parameters, and the workflow / node ids.
      expect(sourceUploadService.uploadFileForSource).toHaveBeenCalledWith(
        file,
        {
          ctxKey: "myFile",
          allowedMimeTypes: ["application/pdf"],
          maxFileSizeMB: 25,
        },
        "group-1",
        "wf-1",
        "upload",
      );
    });

    // -------------------------------------------------------------------
    // Scenario 2: 404 on unknown workflow / source node
    // -------------------------------------------------------------------
    it("Scenario 2a: 404 when the workflow id does not exist", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      workflowService.resolveLineageAndVersion.mockRejectedValue(
        new NotFoundException("Workflow not found: missing"),
      );

      await expect(
        controller.uploadToSource("missing", "upload", makeFile(), mockReq()),
      ).rejects.toThrow(NotFoundException);
      expect(sourceUploadService.uploadFileForSource).not.toHaveBeenCalled();
    });

    it("Scenario 2b: 404 when the sourceNodeId is not in the workflow's nodes", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      setSourceCatalog([fakeSourceUploadEntry]);
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );

      await expect(
        controller.uploadToSource(
          "wf-1",
          "unknown-node",
          makeFile(),
          mockReq(),
        ),
      ).rejects.toThrow(NotFoundException);
      expect(sourceUploadService.uploadFileForSource).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------
    // Scenario 3: 400 on wrong source subtype
    // -------------------------------------------------------------------
    it("Scenario 3: 400 when the resolved node is a source.api (not source.upload)", async () => {
      const { BadRequestException } = await import("@nestjs/common");
      setSourceCatalog([fakeSourceUploadEntry, fakeSourceApiEntry]);
      const wfWithApi: WorkflowInfo = {
        ...mockWorkflowInfo,
        config: {
          ...mockGraphConfig,
          nodes: {
            ...mockGraphConfig.nodes,
            api: {
              id: "api",
              type: "source",
              label: "API",
              sourceType: "source.api",
              parameters: { fields: [] },
            },
          },
        },
      };
      workflowService.resolveLineageAndVersion.mockResolvedValue(wfWithApi);

      await expect(
        controller.uploadToSource("wf-1", "api", makeFile(), mockReq()),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.uploadToSource("wf-1", "api", makeFile(), mockReq()),
      ).rejects.toThrow(/source\.api/);
      expect(sourceUploadService.uploadFileForSource).not.toHaveBeenCalled();
    });

    it("Scenario 3 (regression): 400 when the resolved node is a plain activity, not a source", async () => {
      const { BadRequestException } = await import("@nestjs/common");
      setSourceCatalog([fakeSourceUploadEntry]);
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );

      // The default `mockGraphConfig` has an `activity` node id `start`.
      await expect(
        controller.uploadToSource("wf-1", "start", makeFile(), mockReq()),
      ).rejects.toThrow(BadRequestException);
      expect(sourceUploadService.uploadFileForSource).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------
    // Scenario 4: 400 on MIME mismatch
    //
    // MIME validation lives inside SourceUploadService, so we exercise
    // the controller's propagation by having the service reject with the
    // matching exception type.
    // -------------------------------------------------------------------
    it("Scenario 4: 400 when SourceUploadService rejects with MIME mismatch", async () => {
      const { BadRequestException } = await import("@nestjs/common");
      setSourceCatalog([fakeSourceUploadEntry]);
      const wf: WorkflowInfo = {
        ...mockWorkflowInfo,
        config: {
          ...mockGraphConfig,
          nodes: {
            ...mockGraphConfig.nodes,
            upload: {
              id: "upload",
              type: "source",
              label: "Upload",
              sourceType: "source.upload",
              parameters: { allowedMimeTypes: ["application/pdf"] },
            },
          },
        },
      };
      workflowService.resolveLineageAndVersion.mockResolvedValue(wf);
      sourceUploadService.uploadFileForSource.mockRejectedValue(
        new BadRequestException(
          "File MIME type `image/png` is not permitted by this source. Allowed: [application/pdf]",
        ),
      );

      await expect(
        controller.uploadToSource(
          "wf-1",
          "upload",
          makeFile({ mimetype: "image/png" }),
          mockReq(),
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.uploadToSource(
          "wf-1",
          "upload",
          makeFile({ mimetype: "image/png" }),
          mockReq(),
        ),
      ).rejects.toThrow(/image\/png/);
    });

    // -------------------------------------------------------------------
    // Scenario 5: 413 on oversized file
    //
    // Project precedent (dataset.controller.ts) uses
    // PayloadTooLargeException (413) for size limits — we mirror that.
    // -------------------------------------------------------------------
    it("Scenario 5: 413 when SourceUploadService rejects with PayloadTooLargeException", async () => {
      const { PayloadTooLargeException } = await import("@nestjs/common");
      setSourceCatalog([fakeSourceUploadEntry]);
      const wf: WorkflowInfo = {
        ...mockWorkflowInfo,
        config: {
          ...mockGraphConfig,
          nodes: {
            ...mockGraphConfig.nodes,
            upload: {
              id: "upload",
              type: "source",
              label: "Upload",
              sourceType: "source.upload",
              parameters: { maxFileSizeMB: 5 },
            },
          },
        },
      };
      workflowService.resolveLineageAndVersion.mockResolvedValue(wf);
      sourceUploadService.uploadFileForSource.mockRejectedValue(
        new PayloadTooLargeException(
          "File `huge.pdf` (10485760 bytes) exceeds the source's maximum size of 5 MB",
        ),
      );

      await expect(
        controller.uploadToSource(
          "wf-1",
          "upload",
          makeFile({ size: 10 * 1024 * 1024, originalname: "huge.pdf" }),
          mockReq(),
        ),
      ).rejects.toThrow(PayloadTooLargeException);
    });

    // -------------------------------------------------------------------
    // US-146 Scenario: upload-and-Try kicks off a Temporal run with the
    // uploaded file's ctx reference as initialCtx, and the response
    // includes runId + workflowVersionId. (Replaces the old US-114
    // Scenario 6 "upload-only" contract — Phase 4 changes the endpoint
    // to chain upload → run with one round-trip.)
    // -------------------------------------------------------------------
    it("US-146 Scenario 3: upload commits then kicks off a Temporal run with initialCtx = { [ctxKey]: blobKey }", async () => {
      setSourceCatalog([fakeSourceUploadEntry]);
      const wf: WorkflowInfo = {
        ...mockWorkflowInfo,
        config: {
          ...mockGraphConfig,
          nodes: {
            ...mockGraphConfig.nodes,
            upload: {
              id: "upload",
              type: "source",
              label: "Upload",
              sourceType: "source.upload",
              parameters: { ctxKey: "documentUrl" },
            },
          },
        },
      };
      workflowService.resolveLineageAndVersion.mockResolvedValue(wf);
      sourceUploadService.uploadFileForSource.mockResolvedValue(
        "group-1/ocr/workflow-uploads/wf-1/upload/abc-doc.pdf",
      );
      temporalClient.startGraphWorkflow.mockResolvedValue(
        "graph-adhoc-kicked-off-run",
      );

      const result = await controller.uploadToSource(
        "wf-1",
        "upload",
        makeFile(),
        mockReq(),
      );

      expect(temporalClient.startGraphWorkflow).toHaveBeenCalledTimes(1);
      expect(temporalClient.startGraphWorkflow).toHaveBeenCalledWith(
        undefined, // no documentId — adhoc Try
        wf.workflowVersionId, // pinned/head version id from resolveLineageAndVersion
        {
          documentUrl: "group-1/ocr/workflow-uploads/wf-1/upload/abc-doc.pdf",
        },
        wf.groupId,
      );
      expect(result.runId).toBe("graph-adhoc-kicked-off-run");
      expect(result.workflowVersionId).toBe(wf.workflowVersionId);
    });

    // -------------------------------------------------------------------
    // US-146 Scenario: cancelInFlightTriesForLineage runs BEFORE
    // startGraphWorkflow. The order matters — the new run must NOT race
    // with the prior Try's tail-end cache writes.
    // -------------------------------------------------------------------
    it("US-146 Scenario 4: cancelInFlightTriesForLineage is invoked BEFORE startGraphWorkflow", async () => {
      setSourceCatalog([fakeSourceUploadEntry]);
      const wf: WorkflowInfo = {
        ...mockWorkflowInfo,
        config: {
          ...mockGraphConfig,
          nodes: {
            ...mockGraphConfig.nodes,
            upload: {
              id: "upload",
              type: "source",
              label: "Upload",
              sourceType: "source.upload",
              parameters: { ctxKey: "documentUrl" },
            },
          },
        },
      };
      workflowService.resolveLineageAndVersion.mockResolvedValue(wf);
      sourceUploadService.uploadFileForSource.mockResolvedValue(
        "group-1/ocr/workflow-uploads/wf-1/upload/abc-doc.pdf",
      );

      const callOrder: string[] = [];
      (
        workflowService.cancelInFlightTriesForLineage as jest.Mock
      ).mockImplementation(async () => {
        callOrder.push("cancel");
        return { cancelledCount: 0 };
      });
      temporalClient.startGraphWorkflow.mockImplementation(async () => {
        callOrder.push("start");
        return "graph-adhoc-new-run";
      });

      await controller.uploadToSource("wf-1", "upload", makeFile(), mockReq());

      expect(callOrder).toEqual(["cancel", "start"]);
      expect(
        workflowService.cancelInFlightTriesForLineage,
      ).toHaveBeenCalledWith("wf-1");
    });

    // -------------------------------------------------------------------
    // Additional: missing file part -> 400 (covers the controller guard
    // when the multipart body has no `file` field).
    // -------------------------------------------------------------------
    it("returns 400 when the request has no file part", async () => {
      const { BadRequestException } = await import("@nestjs/common");

      await expect(
        controller.uploadToSource("wf-1", "upload", undefined, mockReq()),
      ).rejects.toThrow(BadRequestException);
      expect(workflowService.resolveLineageAndVersion).not.toHaveBeenCalled();
    });
  });

  describe("createWorkflow", () => {
    it("creates workflow and returns it", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      } as Request;
      const dto: CreateWorkflowDto = {
        name: "New",
        groupId: "group-1",
        config: mockGraphConfig,
      };
      workflowService.createWorkflow.mockResolvedValue(mockWorkflowInfo);
      const result = await controller.createWorkflow(dto, req);
      expect(result).toEqual({ workflow: mockWorkflowInfo });
      expect(workflowService.createWorkflow).toHaveBeenCalledWith(
        "user-1",
        dto,
      );
    });

    it("propagates ForbiddenException when user cannot access target group", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: identityWithGroups({
          "other-group": GroupRole.MEMBER,
        }),
      } as Request;
      const dto: CreateWorkflowDto = {
        name: "New",
        groupId: "group-1",
        config: mockGraphConfig,
      };
      await expect(controller.createWorkflow(dto, req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(workflowService.createWorkflow).not.toHaveBeenCalled();
    });
  });

  describe("updateWorkflow", () => {
    it("updates workflow and returns it for a group member", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      } as Request;
      const dto = { name: "Updated" };
      workflowService.getWorkflow.mockResolvedValue(mockWorkflowInfo);
      workflowService.updateWorkflow.mockResolvedValue({
        ...mockWorkflowInfo,
        name: "Updated",
      });
      const result = await controller.updateWorkflow("wf-1", dto, req);
      expect(result.workflow.name).toBe("Updated");
      expect(workflowService.getWorkflow).toHaveBeenCalledWith(
        "wf-1",
        "user-1",
      );
      expect(workflowService.updateWorkflow).toHaveBeenCalledWith(
        "wf-1",
        "user-1",
        dto,
      );
    });

    it("throws ForbiddenException when user cannot access workflow group", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: identityWithGroups({
          "other-group": GroupRole.MEMBER,
        }),
      } as Request;
      const dto = { name: "Updated" };
      workflowService.getWorkflow.mockResolvedValue(mockWorkflowInfo);
      await expect(controller.updateWorkflow("wf-1", dto, req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(workflowService.updateWorkflow).not.toHaveBeenCalled();
    });
  });

  describe("deleteWorkflow", () => {
    it("deletes workflow for a group member", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      } as Request;
      workflowService.getWorkflow.mockResolvedValue(mockWorkflowInfo);
      workflowService.deleteWorkflow.mockResolvedValue(undefined);
      await controller.deleteWorkflow("wf-1", req);
      expect(workflowService.getWorkflow).toHaveBeenCalledWith(
        "wf-1",
        "user-1",
      );
      expect(workflowService.deleteWorkflow).toHaveBeenCalledWith(
        "wf-1",
        "user-1",
      );
    });

    it("throws ForbiddenException when user cannot access workflow group", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: identityWithGroups({
          "other-group": GroupRole.MEMBER,
        }),
      } as Request;
      workflowService.getWorkflow.mockResolvedValue(mockWorkflowInfo);
      await expect(controller.deleteWorkflow("wf-1", req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(workflowService.deleteWorkflow).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // US-136 — `GET /:id/runs/:runId/node-statuses` proxy endpoint
  // ---------------------------------------------------------------------------
  describe("getNodeStatuses (US-136)", () => {
    const mockReq = () =>
      ({
        protocol: "http",
        headers: { host: "localhost:3002" },
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      }) as unknown as Request;

    // Re-create the Temporal SDK's `WorkflowNotFoundError` shape — the
    // production controller uses `instanceof WorkflowNotFoundError` to
    // discriminate, and Jest preserves the prototype chain when we import
    // the real class from `@temporalio/client`.
    const makeTemporalNotFound = (message: string): Error =>
      new WorkflowNotFoundError(message, "graph-adhoc-xyz", undefined);

    // Scenario 2: Query Temporal + return the map (happy path)
    it("Scenario 2: returns the per-node status map from Temporal", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );
      const statuses = {
        "node-1": {
          status: "succeeded" as const,
          startedAt: "2026-05-24T12:00:00.000Z",
          endedAt: "2026-05-24T12:00:01.500Z",
        },
        "node-2": {
          status: "running" as const,
          startedAt: "2026-05-24T12:00:01.500Z",
        },
      };
      (temporalClient.queryNodeStatuses as jest.Mock).mockResolvedValue(
        statuses,
      );

      const result = await controller.getNodeStatuses(
        "wf-1",
        "graph-adhoc-xyz",
        mockReq(),
      );

      expect(result).toEqual(statuses);
      expect(temporalClient.queryNodeStatuses).toHaveBeenCalledWith(
        "graph-adhoc-xyz",
      );
      expect(workflowService.resolveLineageAndVersion).toHaveBeenCalledWith(
        "wf-1",
      );
    });

    // Scenario 3: Unknown runId → 404
    it("Scenario 3: returns 404 NotFoundException when Temporal throws WorkflowNotFoundError for an unknown run", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );
      (temporalClient.queryNodeStatuses as jest.Mock).mockRejectedValue(
        makeTemporalNotFound("workflow execution not found"),
      );

      let caught: unknown;
      try {
        await controller.getNodeStatuses("wf-1", "graph-adhoc-typo", mockReq());
      } catch (err) {
        caught = err;
      }
      const { NotFoundException } = await import("@nestjs/common");
      expect(caught).toBeInstanceOf(NotFoundException);
      const nfe = caught as InstanceType<typeof NotFoundException>;
      const response = nfe.getResponse() as { message: string };
      expect(response.message).toBe("Run not found");
    });

    // Scenario 4: Retention-cleaned run → 410 Gone
    it("Scenario 4: returns 410 GoneException when Temporal reports the run history is retention-cleaned", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );
      (temporalClient.queryNodeStatuses as jest.Mock).mockRejectedValue(
        makeTemporalNotFound("workflow history not found — past retention"),
      );

      let caught: unknown;
      try {
        await controller.getNodeStatuses("wf-1", "graph-adhoc-old", mockReq());
      } catch (err) {
        caught = err;
      }
      const { GoneException } = await import("@nestjs/common");
      expect(caught).toBeInstanceOf(GoneException);
      const ge = caught as InstanceType<typeof GoneException>;
      const response = ge.getResponse() as { message: string };
      expect(response.message).toMatch(/Run history no longer available/);
    });

    // Scenario 1: Auth — non-member of the workflow's group → 403
    it("Scenario 1 (auth): throws ForbiddenException when caller cannot access the workflow's group", async () => {
      const req = {
        protocol: "http",
        headers: { host: "localhost:3002" },
        resolvedIdentity: identityWithGroups({
          "other-group": GroupRole.MEMBER,
        }),
      } as unknown as Request;
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );

      await expect(
        controller.getNodeStatuses("wf-1", "graph-adhoc-xyz", req),
      ).rejects.toThrow(ForbiddenException);
      expect(temporalClient.queryNodeStatuses).not.toHaveBeenCalled();
    });

    // Scenario 1 (workflow id 404): propagates NotFoundException from the service
    it("Scenario 1 (unknown workflow id): propagates NotFoundException from resolveLineageAndVersion", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      workflowService.resolveLineageAndVersion.mockRejectedValue(
        new NotFoundException("Workflow not found: missing"),
      );

      await expect(
        controller.getNodeStatuses("missing", "graph-adhoc-xyz", mockReq()),
      ).rejects.toThrow(NotFoundException);
      expect(temporalClient.queryNodeStatuses).not.toHaveBeenCalled();
    });

    // Non-Temporal errors propagate unchanged (e.g. connection error) so the
    // canvas surfaces an HTTP 500 rather than masking it as 404 / 410.
    it("propagates non-Temporal errors unchanged", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );
      const unexpected = new Error("connection refused");
      (temporalClient.queryNodeStatuses as jest.Mock).mockRejectedValue(
        unexpected,
      );

      await expect(
        controller.getNodeStatuses("wf-1", "graph-adhoc-xyz", mockReq()),
      ).rejects.toThrow(unexpected);
    });
  });

  // ---------------------------------------------------------------------------
  // US-140 — `GET /:id/preview-cache?nodeId=...[&runId=...]` endpoint
  // ---------------------------------------------------------------------------
  describe("getPreviewCache (US-140)", () => {
    const mockReq = () =>
      ({
        protocol: "http",
        headers: { host: "localhost:3002" },
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      }) as unknown as Request;

    const cacheRow = {
      id: "row-1",
      workflowLineageId: "wf-1",
      nodeId: "node-1",
      configHash: "cfg-hash",
      inputHash: "in-hash",
      outputCtx: { pageCount: 12, summary: "ok" },
      outputKind: "Document",
      createdAt: new Date("2026-05-24T12:00:30Z"),
      expiresAt: new Date("2026-05-25T12:00:30Z"),
    };

    // ---------------------------------------------------------------------
    // Scenario 2: Default (no runId) — returns most recent fresh row
    // ---------------------------------------------------------------------
    it("Scenario 2: default (no runId) returns most recent fresh row mapped to ActivityOutputPreviewDto", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );
      activityOutputCache.findMostRecentFresh.mockResolvedValue(cacheRow);

      const result = await controller.getPreviewCache(
        "wf-1",
        "node-1",
        undefined,
        mockReq(),
      );

      expect(result).toEqual({
        outputCtx: { pageCount: 12, summary: "ok" },
        outputKind: "Document",
        createdAt: "2026-05-24T12:00:30.000Z",
        expiresAt: "2026-05-25T12:00:30.000Z",
      });
      expect(activityOutputCache.findMostRecentFresh).toHaveBeenCalledWith({
        workflowLineageId: "wf-1",
        nodeId: "node-1",
      });
      expect(activityOutputCache.findInRunWindow).not.toHaveBeenCalled();
      expect(temporalClient.getRunWindow).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------------
    // Scenario 3: With runId — returns row from that run's window
    // ---------------------------------------------------------------------
    it("Scenario 3: with runId queries Temporal for the run window then returns the row from findInRunWindow", async () => {
      const startedAt = new Date("2026-05-24T12:00:00Z");
      const endedAt = new Date("2026-05-24T12:01:00Z");
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );
      (temporalClient.getRunWindow as jest.Mock).mockResolvedValue({
        startedAt,
        endedAt,
      });
      activityOutputCache.findInRunWindow.mockResolvedValue(cacheRow);

      const result = await controller.getPreviewCache(
        "wf-1",
        "node-1",
        "graph-adhoc-xyz",
        mockReq(),
      );

      expect(result.createdAt).toBe("2026-05-24T12:00:30.000Z");
      expect(temporalClient.getRunWindow).toHaveBeenCalledWith(
        "graph-adhoc-xyz",
      );
      expect(activityOutputCache.findInRunWindow).toHaveBeenCalledWith({
        workflowLineageId: "wf-1",
        nodeId: "node-1",
        startedAt,
        endedAt,
      });
      expect(activityOutputCache.findMostRecentFresh).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------------
    // Scenario 3 (in-flight): endedAt is null → uses current time as upper bound
    // ---------------------------------------------------------------------
    it("Scenario 3 (in-flight): substitutes current time as upper bound when the run has not yet closed", async () => {
      const startedAt = new Date("2026-05-24T12:00:00Z");
      const now = new Date("2026-05-24T12:05:00Z");
      jest.useFakeTimers().setSystemTime(now);

      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );
      (temporalClient.getRunWindow as jest.Mock).mockResolvedValue({
        startedAt,
        endedAt: null,
      });
      activityOutputCache.findInRunWindow.mockResolvedValue(cacheRow);

      await controller.getPreviewCache(
        "wf-1",
        "node-1",
        "graph-adhoc-running",
        mockReq(),
      );

      expect(activityOutputCache.findInRunWindow).toHaveBeenCalledWith({
        workflowLineageId: "wf-1",
        nodeId: "node-1",
        startedAt,
        endedAt: now,
      });

      jest.useRealTimers();
    });

    // ---------------------------------------------------------------------
    // Scenario 4: 404 when no fresh row matches (default path)
    // ---------------------------------------------------------------------
    it("Scenario 4 (default): 404 NotFoundException with the expected message when no fresh row exists", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );
      activityOutputCache.findMostRecentFresh.mockResolvedValue(null);

      const { NotFoundException } = await import("@nestjs/common");
      let caught: unknown;
      try {
        await controller.getPreviewCache(
          "wf-1",
          "node-1",
          undefined,
          mockReq(),
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(NotFoundException);
      const nfe = caught as InstanceType<typeof NotFoundException>;
      const response = nfe.getResponse() as { message: string };
      expect(response.message).toBe("No cached output for this node");
    });

    // ---------------------------------------------------------------------
    // Scenario 4 (scoped, no match): 404 when runId resolves but cache miss
    // ---------------------------------------------------------------------
    it("Scenario 4 (scoped, no match): 404 NotFoundException when the run window resolves but no cache row falls within it", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );
      (temporalClient.getRunWindow as jest.Mock).mockResolvedValue({
        startedAt: new Date("2026-05-24T12:00:00Z"),
        endedAt: new Date("2026-05-24T12:01:00Z"),
      });
      activityOutputCache.findInRunWindow.mockResolvedValue(null);

      const { NotFoundException } = await import("@nestjs/common");
      await expect(
        controller.getPreviewCache(
          "wf-1",
          "node-1",
          "graph-adhoc-xyz",
          mockReq(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    // ---------------------------------------------------------------------
    // Scenario 4 (unknown run): runId on a non-existent execution → 404
    // ---------------------------------------------------------------------
    it("Scenario 4 (unknown runId): 404 NotFoundException when Temporal throws WorkflowNotFoundError for an unknown run", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );
      (temporalClient.getRunWindow as jest.Mock).mockRejectedValue(
        new WorkflowNotFoundError(
          "workflow execution not found",
          "graph-adhoc-typo",
          undefined,
        ),
      );

      const { NotFoundException } = await import("@nestjs/common");
      let caught: unknown;
      try {
        await controller.getPreviewCache(
          "wf-1",
          "node-1",
          "graph-adhoc-typo",
          mockReq(),
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(NotFoundException);
      const nfe = caught as InstanceType<typeof NotFoundException>;
      const response = nfe.getResponse() as { message: string };
      expect(response.message).toBe("No cached output for this node");
      expect(activityOutputCache.findInRunWindow).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------------
    // Scenario 1 (auth): non-member of the workflow's group → 403
    // ---------------------------------------------------------------------
    it("Scenario 1 (auth): throws ForbiddenException when caller cannot access the workflow's group", async () => {
      const req = {
        protocol: "http",
        headers: { host: "localhost:3002" },
        resolvedIdentity: identityWithGroups({
          "other-group": GroupRole.MEMBER,
        }),
      } as unknown as Request;
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );

      await expect(
        controller.getPreviewCache("wf-1", "node-1", undefined, req),
      ).rejects.toThrow(ForbiddenException);
      expect(activityOutputCache.findMostRecentFresh).not.toHaveBeenCalled();
      expect(temporalClient.getRunWindow).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------------
    // Scenario 1 (missing nodeId): 400 when nodeId query param is absent
    // ---------------------------------------------------------------------
    it("Scenario 1 (missing nodeId): throws BadRequestException when nodeId is empty / undefined", async () => {
      const { BadRequestException } = await import("@nestjs/common");
      // Cast through unknown — exercise the runtime guard against missing
      // required query params (Nest passes undefined when a @Query() field is absent).
      await expect(
        controller.getPreviewCache(
          "wf-1",
          undefined as unknown as string,
          undefined,
          mockReq(),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(workflowService.resolveLineageAndVersion).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------------
    // Workflow id 404 from service → propagates as NotFoundException
    // ---------------------------------------------------------------------
    it("propagates NotFoundException when the workflow id does not exist", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      workflowService.resolveLineageAndVersion.mockRejectedValue(
        new NotFoundException("Workflow not found: missing"),
      );

      await expect(
        controller.getPreviewCache("missing", "node-1", undefined, mockReq()),
      ).rejects.toThrow(NotFoundException);
      expect(activityOutputCache.findMostRecentFresh).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------------
    // Non-Temporal errors propagate unchanged (e.g. connection error)
    // ---------------------------------------------------------------------
    it("propagates non-Temporal errors from getRunWindow unchanged", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );
      const unexpected = new Error("connection refused");
      (temporalClient.getRunWindow as jest.Mock).mockRejectedValue(unexpected);

      await expect(
        controller.getPreviewCache(
          "wf-1",
          "node-1",
          "graph-adhoc-xyz",
          mockReq(),
        ),
      ).rejects.toThrow(unexpected);
    });
  });

  // ---------------------------------------------------------------------------
  // US-152 — `GET /:id/versions/:versionId/run-count` endpoint
  // ---------------------------------------------------------------------------
  describe("getVersionRunCount (US-152)", () => {
    const mockReq = () =>
      ({
        protocol: "http",
        headers: { host: "localhost:3002" },
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      }) as unknown as Request;

    afterEach(() => {
      jest.useRealTimers();
    });

    // Scenario 1 + 2: endpoint returns the count from Temporal visibility
    it("Scenario 1 + 2: returns { runCount } sourced from temporalClient.countRunsForVersion", async () => {
      workflowService.getWorkflowVersionById.mockResolvedValue(
        mockWorkflowInfo,
      );
      (temporalClient.countRunsForVersion as jest.Mock).mockResolvedValue(7);

      const result = await controller.getVersionRunCount(
        "wf-1",
        "wv-wf-1",
        mockReq(),
      );

      expect(result).toEqual({ runCount: 7 });
      expect(temporalClient.countRunsForVersion).toHaveBeenCalledWith(
        "wf-1",
        "wv-wf-1",
      );
      expect(workflowService.getWorkflowVersionById).toHaveBeenCalledWith(
        "wv-wf-1",
      );
    });

    // Scenario 3: cache hit — repeated calls within TTL return cached value
    it("Scenario 3 (LRU hit): subsequent calls within 60s return the cached count without re-hitting Temporal", async () => {
      workflowService.getWorkflowVersionById.mockResolvedValue(
        mockWorkflowInfo,
      );
      (temporalClient.countRunsForVersion as jest.Mock).mockResolvedValue(4);

      const first = await controller.getVersionRunCount(
        "wf-1",
        "wv-wf-1",
        mockReq(),
      );
      const second = await controller.getVersionRunCount(
        "wf-1",
        "wv-wf-1",
        mockReq(),
      );

      expect(first).toEqual({ runCount: 4 });
      expect(second).toEqual({ runCount: 4 });
      expect(temporalClient.countRunsForVersion).toHaveBeenCalledTimes(1);
    });

    // Scenario 3 (continued): cache expires after the TTL elapses
    it("Scenario 3 (LRU expired): a call after the 60s TTL re-fetches from Temporal", async () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-05-24T12:00:00Z"));
      workflowService.getWorkflowVersionById.mockResolvedValue(
        mockWorkflowInfo,
      );
      (temporalClient.countRunsForVersion as jest.Mock)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(5);

      const first = await controller.getVersionRunCount(
        "wf-1",
        "wv-wf-1",
        mockReq(),
      );
      // Advance just past the 60s TTL.
      jest.setSystemTime(new Date("2026-05-24T12:01:01Z"));
      const second = await controller.getVersionRunCount(
        "wf-1",
        "wv-wf-1",
        mockReq(),
      );

      expect(first).toEqual({ runCount: 2 });
      expect(second).toEqual({ runCount: 5 });
      expect(temporalClient.countRunsForVersion).toHaveBeenCalledTimes(2);
    });

    // Scenario 1 (auth): non-member of the workflow's group → 403
    it("Scenario 1 (auth): throws ForbiddenException when caller cannot access the workflow's group", async () => {
      const req = {
        protocol: "http",
        headers: { host: "localhost:3002" },
        resolvedIdentity: identityWithGroups({
          "other-group": GroupRole.MEMBER,
        }),
      } as unknown as Request;
      workflowService.getWorkflowVersionById.mockResolvedValue(
        mockWorkflowInfo,
      );

      await expect(
        controller.getVersionRunCount("wf-1", "wv-wf-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(temporalClient.countRunsForVersion).not.toHaveBeenCalled();
    });

    // Scenario 1 (404 — unknown version): missing version id → NotFoundException
    it("Scenario 1 (404 missing version): throws NotFoundException when getWorkflowVersionById returns null", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      workflowService.getWorkflowVersionById.mockResolvedValue(null);

      await expect(
        controller.getVersionRunCount("wf-1", "wv-missing", mockReq()),
      ).rejects.toThrow(NotFoundException);
      expect(temporalClient.countRunsForVersion).not.toHaveBeenCalled();
    });

    // Scenario 1 (404 — version belongs to a different lineage): cross-lineage
    // protection mirrors `getVersion`'s shape.
    it("Scenario 1 (404 wrong lineage): throws NotFoundException when the version belongs to a different lineage", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      workflowService.getWorkflowVersionById.mockResolvedValue({
        ...mockWorkflowInfo,
        id: "other-lineage",
      });

      await expect(
        controller.getVersionRunCount("wf-1", "wv-wf-1", mockReq()),
      ).rejects.toThrow(NotFoundException);
      expect(temporalClient.countRunsForVersion).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // US-151 — `GET /:id/runs/:runId/input-ctx` endpoint
  // ---------------------------------------------------------------------------
  describe("getInputCtx (US-151)", () => {
    const mockReq = () =>
      ({
        protocol: "http",
        headers: { host: "localhost:3002" },
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      }) as unknown as Request;

    // Workflow config carrying a single source node so the fallback
    // path has somewhere to look up the cache row against.
    const workflowWithSource: WorkflowInfo = {
      ...mockWorkflowInfo,
      config: {
        ...mockGraphConfig,
        entryNodeId: "src",
        nodes: {
          src: {
            id: "src",
            type: "source",
            label: "Source",
            sourceType: "source.upload",
            parameters: { ctxKey: "documentUrl", allowedMimeTypes: ["*/*"] },
          },
          start: mockGraphConfig.nodes.start,
        },
      },
    };

    const makeTemporalNotFound = (message: string): Error =>
      new WorkflowNotFoundError(message, "graph-adhoc-xyz", undefined);

    // ---------------------------------------------------------------------
    // Scenario 2: happy path — returns the Temporal start args' initialCtx
    // ---------------------------------------------------------------------
    it("Scenario 2: returns the Temporal workflow input's initialCtx", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        workflowWithSource,
      );
      (temporalClient.getRunInput as jest.Mock).mockResolvedValue({
        initialCtx: { documentUrl: "blob://group-1/doc-1.pdf" },
        workflowLineageId: "wf-1",
      });

      const result = await controller.getInputCtx(
        "wf-1",
        "graph-adhoc-xyz",
        mockReq(),
      );

      expect(result).toEqual({
        initialCtx: { documentUrl: "blob://group-1/doc-1.pdf" },
      });
      expect(temporalClient.getRunInput).toHaveBeenCalledWith(
        "graph-adhoc-xyz",
      );
      expect(activityOutputCache.findInRunWindow).not.toHaveBeenCalled();
      expect(activityOutputCache.findMostRecentFresh).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------------
    // Scenario 2 (lineageId missing from start args): still returns input
    // ---------------------------------------------------------------------
    it("Scenario 2 (no lineage in args): returns initialCtx when start args carry no workflowLineageId", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        workflowWithSource,
      );
      (temporalClient.getRunInput as jest.Mock).mockResolvedValue({
        initialCtx: { hello: "world" },
        workflowLineageId: null,
      });

      const result = await controller.getInputCtx(
        "wf-1",
        "graph-adhoc-legacy",
        mockReq(),
      );

      expect(result).toEqual({ initialCtx: { hello: "world" } });
    });

    // ---------------------------------------------------------------------
    // Scenario 3: Temporal input missing → fallback to cache row in run window
    // ---------------------------------------------------------------------
    it("Scenario 3: falls back to the source node's cache row when Temporal input is missing", async () => {
      const startedAt = new Date("2026-05-24T12:00:00Z");
      const endedAt = new Date("2026-05-24T12:01:00Z");
      const cacheRow = {
        id: "row-1",
        workflowLineageId: "wf-1",
        nodeId: "src",
        configHash: "cfg-hash",
        inputHash: "in-hash",
        outputCtx: { documentUrl: "blob://group-1/doc-1.pdf" },
        outputKind: "Document",
        createdAt: new Date("2026-05-24T12:00:30Z"),
        expiresAt: new Date("2026-05-25T12:00:30Z"),
      };

      workflowService.resolveLineageAndVersion.mockResolvedValue(
        workflowWithSource,
      );
      (temporalClient.getRunInput as jest.Mock).mockResolvedValue(null);
      (temporalClient.getRunWindow as jest.Mock).mockResolvedValue({
        startedAt,
        endedAt,
      });
      activityOutputCache.findInRunWindow.mockResolvedValue(cacheRow);

      const result = await controller.getInputCtx(
        "wf-1",
        "graph-adhoc-fallback",
        mockReq(),
      );

      expect(result).toEqual({
        initialCtx: { documentUrl: "blob://group-1/doc-1.pdf" },
      });
      expect(activityOutputCache.findInRunWindow).toHaveBeenCalledWith({
        workflowLineageId: "wf-1",
        nodeId: "src",
        startedAt,
        endedAt,
      });
    });

    // ---------------------------------------------------------------------
    // Scenario 3 (history retention-cleaned): fallback uses findMostRecentFresh
    // ---------------------------------------------------------------------
    it("Scenario 3 (history evicted): retention-cleaned history falls back to findMostRecentFresh", async () => {
      const cacheRow = {
        id: "row-2",
        workflowLineageId: "wf-1",
        nodeId: "src",
        configHash: "cfg-hash",
        inputHash: "in-hash",
        outputCtx: { documentUrl: "blob://group-1/doc-1.pdf" },
        outputKind: "Document",
        createdAt: new Date("2026-05-24T12:00:30Z"),
        expiresAt: new Date("2026-05-25T12:00:30Z"),
      };

      workflowService.resolveLineageAndVersion.mockResolvedValue(
        workflowWithSource,
      );
      (temporalClient.getRunInput as jest.Mock).mockRejectedValue(
        makeTemporalNotFound("workflow history reached retention period"),
      );
      activityOutputCache.findMostRecentFresh.mockResolvedValue(cacheRow);

      const result = await controller.getInputCtx(
        "wf-1",
        "graph-adhoc-old",
        mockReq(),
      );

      expect(result).toEqual({
        initialCtx: { documentUrl: "blob://group-1/doc-1.pdf" },
      });
      expect(activityOutputCache.findMostRecentFresh).toHaveBeenCalledWith({
        workflowLineageId: "wf-1",
        nodeId: "src",
      });
      // We never call getRunWindow when the history is gone — there's no
      // window to scope to.
      expect(temporalClient.getRunWindow).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------------
    // Scenario 3 (both missing): 404
    // ---------------------------------------------------------------------
    it("Scenario 3 (both missing): returns 404 when Temporal AND the cache row are both unavailable", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        workflowWithSource,
      );
      (temporalClient.getRunInput as jest.Mock).mockResolvedValue(null);
      (temporalClient.getRunWindow as jest.Mock).mockResolvedValue({
        startedAt: new Date("2026-05-24T12:00:00Z"),
        endedAt: new Date("2026-05-24T12:01:00Z"),
      });
      activityOutputCache.findInRunWindow.mockResolvedValue(null);

      let caught: unknown;
      try {
        await controller.getInputCtx("wf-1", "graph-adhoc-empty", mockReq());
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(NotFoundException);
      const nfe = caught as InstanceType<typeof NotFoundException>;
      const response = nfe.getResponse() as { message: string };
      expect(response.message).toBe(
        "Input not available — run too old or never captured",
      );
    });

    // ---------------------------------------------------------------------
    // Scenario 3 (no source node + no Temporal input): 404
    // ---------------------------------------------------------------------
    it("Scenario 3 (no source node, no Temporal input): returns 404 without touching the cache", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );
      (temporalClient.getRunInput as jest.Mock).mockResolvedValue(null);
      (temporalClient.getRunWindow as jest.Mock).mockResolvedValue({
        startedAt: new Date("2026-05-24T12:00:00Z"),
        endedAt: new Date("2026-05-24T12:01:00Z"),
      });

      await expect(
        controller.getInputCtx("wf-1", "graph-adhoc-empty", mockReq()),
      ).rejects.toThrow(NotFoundException);

      expect(activityOutputCache.findInRunWindow).not.toHaveBeenCalled();
      expect(activityOutputCache.findMostRecentFresh).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------------
    // Scenario 4: 403 — runId belongs to a different lineage
    // ---------------------------------------------------------------------
    it("Scenario 4: returns 403 ForbiddenException when runId belongs to a different lineage", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        workflowWithSource,
      );
      (temporalClient.getRunInput as jest.Mock).mockResolvedValue({
        initialCtx: { documentUrl: "blob://group-1/doc-2.pdf" },
        workflowLineageId: "other-lineage",
      });

      let caught: unknown;
      try {
        await controller.getInputCtx("wf-1", "graph-adhoc-other", mockReq());
      } catch (err) {
        caught = err;
      }
      const { ForbiddenException } = await import("@nestjs/common");
      expect(caught).toBeInstanceOf(ForbiddenException);
      const fe = caught as InstanceType<typeof ForbiddenException>;
      const response = fe.getResponse() as { message: string };
      expect(response.message).toBe("Run does not belong to this workflow");
      expect(activityOutputCache.findInRunWindow).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------------
    // Scenario 4: 404 — completely-unknown runId (Temporal NotFound, non-retention)
    // ---------------------------------------------------------------------
    it("Scenario 4: returns 404 when Temporal reports the runId is unknown (not retention-cleaned)", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        workflowWithSource,
      );
      (temporalClient.getRunInput as jest.Mock).mockRejectedValue(
        makeTemporalNotFound("workflow execution not found"),
      );

      let caught: unknown;
      try {
        await controller.getInputCtx("wf-1", "graph-adhoc-typo", mockReq());
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(NotFoundException);
      const nfe = caught as InstanceType<typeof NotFoundException>;
      const response = nfe.getResponse() as { message: string };
      expect(response.message).toBe(
        "Input not available — run too old or never captured",
      );
      expect(activityOutputCache.findInRunWindow).not.toHaveBeenCalled();
      expect(activityOutputCache.findMostRecentFresh).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------------
    // Scenario 1: auth — non-member of the workflow's group → 403
    // ---------------------------------------------------------------------
    it("Scenario 1 (auth): throws ForbiddenException when caller cannot access the workflow's group", async () => {
      const req = {
        protocol: "http",
        headers: { host: "localhost:3002" },
        resolvedIdentity: identityWithGroups({
          "other-group": GroupRole.MEMBER,
        }),
      } as unknown as Request;
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        workflowWithSource,
      );

      await expect(
        controller.getInputCtx("wf-1", "graph-adhoc-xyz", req),
      ).rejects.toThrow(ForbiddenException);
      expect(temporalClient.getRunInput).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------------
    // Scenario 1 (workflow id 404): NotFoundException from the service
    // ---------------------------------------------------------------------
    it("Scenario 1 (unknown workflow id): propagates NotFoundException from resolveLineageAndVersion", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      workflowService.resolveLineageAndVersion.mockRejectedValue(
        new NotFoundException("Workflow not found: missing"),
      );

      await expect(
        controller.getInputCtx("missing", "graph-adhoc-xyz", mockReq()),
      ).rejects.toThrow(NotFoundException);
      expect(temporalClient.getRunInput).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------------
    // Non-Temporal errors from getRunInput propagate unchanged
    // ---------------------------------------------------------------------
    it("propagates non-Temporal errors from getRunInput unchanged", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        workflowWithSource,
      );
      const unexpected = new Error("connection refused");
      (temporalClient.getRunInput as jest.Mock).mockRejectedValue(unexpected);

      await expect(
        controller.getInputCtx("wf-1", "graph-adhoc-xyz", mockReq()),
      ).rejects.toThrow(unexpected);
      expect(activityOutputCache.findInRunWindow).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------------
    // Non-Temporal errors from getRunWindow propagate unchanged (fallback path)
    // ---------------------------------------------------------------------
    it("propagates non-Temporal errors from getRunWindow unchanged (fallback path)", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        workflowWithSource,
      );
      (temporalClient.getRunInput as jest.Mock).mockResolvedValue(null);
      const unexpected = new Error("connection refused");
      (temporalClient.getRunWindow as jest.Mock).mockRejectedValue(unexpected);

      await expect(
        controller.getInputCtx("wf-1", "graph-adhoc-xyz", mockReq()),
      ).rejects.toThrow(unexpected);
    });

    // ---------------------------------------------------------------------
    // Fallback unknown runId on the run-window call → 404
    // ---------------------------------------------------------------------
    it("returns 404 when the fallback getRunWindow call reports the runId is unknown", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        workflowWithSource,
      );
      (temporalClient.getRunInput as jest.Mock).mockResolvedValue(null);
      (temporalClient.getRunWindow as jest.Mock).mockRejectedValue(
        new WorkflowNotFoundError(
          "workflow execution not found",
          "graph-adhoc-typo",
          undefined,
        ),
      );

      let caught: unknown;
      try {
        await controller.getInputCtx("wf-1", "graph-adhoc-typo", mockReq());
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(NotFoundException);
      const nfe = caught as InstanceType<typeof NotFoundException>;
      const response = nfe.getResponse() as { message: string };
      expect(response.message).toBe(
        "Input not available — run too old or never captured",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // US-150 — `GET /:id/runs` — run-history endpoint
  // ---------------------------------------------------------------------------
  describe("listRuns (US-150)", () => {
    const mockReq = () =>
      ({
        protocol: "http",
        headers: { host: "localhost:3002" },
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      }) as unknown as Request;

    const buildExecution = (overrides: {
      runId: string;
      versionNumber?: number;
      status?: "Running" | "Completed" | "Failed" | "Canceled" | "Unknown";
      workflowVersionId?: string;
      startedAt?: Date;
      endedAt?: Date | null;
    }) => ({
      runId: overrides.runId,
      workflowVersionId: overrides.workflowVersionId ?? "wv-wf-1",
      versionNumber: overrides.versionNumber ?? 3,
      status: overrides.status ?? "Completed",
      startedAt: overrides.startedAt ?? new Date("2026-05-24T12:00:00Z"),
      endedAt:
        overrides.endedAt === undefined
          ? new Date("2026-05-24T12:00:42Z")
          : overrides.endedAt,
    });

    // ---------------------------------------------------------------------
    // Scenario 6 (happy-path): first page returns the most recent runs
    // with inputCtxSummary populated for each row.
    // ---------------------------------------------------------------------
    it("Scenario 6 (happy path): returns the most recent runs with inputCtxSummary on the first page", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );
      (temporalClient.listRunsForWorkflow as jest.Mock).mockResolvedValue({
        executions: [
          buildExecution({ runId: "run-1" }),
          buildExecution({ runId: "run-2", versionNumber: 2 }),
        ],
        nextCursor: null,
      });
      (temporalClient.getRunInput as jest.Mock).mockImplementation(
        (id: string) =>
          Promise.resolve({
            initialCtx: { customerId: `cust-${id}`, modelId: "gpt-5" },
            workflowLineageId: "wf-1",
          }),
      );

      const result = await controller.listRuns("wf-1", {}, mockReq());

      expect(result.nextCursor).toBeNull();
      expect(result.runs).toHaveLength(2);
      expect(result.runs[0]).toEqual({
        runId: "run-1",
        workflowVersionId: "wv-wf-1",
        versionNumber: 3,
        status: "succeeded",
        startedAt: "2026-05-24T12:00:00.000Z",
        endedAt: "2026-05-24T12:00:42.000Z",
        inputCtxSummary: { customerId: "cust-run-1", modelId: "gpt-5" },
      });
      expect(result.runs[1].versionNumber).toBe(2);
      expect(result.runs[1].inputCtxSummary).toEqual({
        customerId: "cust-run-2",
        modelId: "gpt-5",
      });
      // First page = limit defaults to 50.
      expect(temporalClient.listRunsForWorkflow).toHaveBeenCalledWith({
        workflowLineageId: "wf-1",
        status: undefined,
        startedAfter: undefined,
        startedBefore: undefined,
        workflowVersionId: undefined,
        pageSize: 50,
        cursor: undefined,
      });
    });

    // ---------------------------------------------------------------------
    // Scenario 3 (status filter): status narrows the visibility query
    // ---------------------------------------------------------------------
    it("Scenario 3 (status filter): translates DTO status to Temporal enum and passes it through", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );
      (temporalClient.listRunsForWorkflow as jest.Mock).mockResolvedValue({
        executions: [
          buildExecution({
            runId: "run-fail",
            status: "Failed",
            endedAt: new Date("2026-05-24T12:00:05Z"),
          }),
        ],
        nextCursor: null,
      });
      (temporalClient.getRunInput as jest.Mock).mockResolvedValue({
        initialCtx: { customerId: "cust-x" },
        workflowLineageId: "wf-1",
      });

      const result = await controller.listRuns(
        "wf-1",
        { status: "failed" },
        mockReq(),
      );

      expect(result.runs[0].status).toBe("failed");
      expect(temporalClient.listRunsForWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "Failed",
        }),
      );
    });

    // ---------------------------------------------------------------------
    // Scenario 3 (date-range filter): startedAfter + startedBefore both passed through
    // ---------------------------------------------------------------------
    it("Scenario 3 (date range): forwards startedAfter / startedBefore / workflowVersionId verbatim", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );
      (temporalClient.listRunsForWorkflow as jest.Mock).mockResolvedValue({
        executions: [],
        nextCursor: null,
      });

      await controller.listRuns(
        "wf-1",
        {
          startedAfter: "2026-05-24T00:00:00.000Z",
          startedBefore: "2026-05-25T00:00:00.000Z",
          workflowVersionId: "wv-pinned",
        },
        mockReq(),
      );

      expect(temporalClient.listRunsForWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          startedAfter: "2026-05-24T00:00:00.000Z",
          startedBefore: "2026-05-25T00:00:00.000Z",
          workflowVersionId: "wv-pinned",
        }),
      );
    });

    // ---------------------------------------------------------------------
    // Scenario 3 (pagination): passing a cursor fetches the next page AND
    // suppresses the per-row inputCtxSummary (perf budget).
    // ---------------------------------------------------------------------
    it("Scenario 3 (pagination): forwards cursor + limit to the helper; subsequent pages omit inputCtxSummary", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );
      (temporalClient.listRunsForWorkflow as jest.Mock).mockResolvedValue({
        executions: [
          buildExecution({ runId: "run-3" }),
          buildExecution({ runId: "run-4" }),
        ],
        nextCursor: "next-page-token-base64",
      });

      const result = await controller.listRuns(
        "wf-1",
        { cursor: "page-2-token", limit: 25 },
        mockReq(),
      );

      // Cursor + pageSize propagated.
      expect(temporalClient.listRunsForWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: "page-2-token",
          pageSize: 25,
        }),
      );
      // Response surfaces next cursor.
      expect(result.nextCursor).toBe("next-page-token-base64");
      // Non-first page = no inputCtxSummary on any row + no describe calls.
      expect(temporalClient.getRunInput).not.toHaveBeenCalled();
      for (const run of result.runs) {
        expect(run.inputCtxSummary).toBeUndefined();
      }
    });

    // ---------------------------------------------------------------------
    // Scenario 5: 400 on inverted date range
    // ---------------------------------------------------------------------
    it("Scenario 5: throws BadRequestException when startedAfter > startedBefore", async () => {
      const { BadRequestException } = await import("@nestjs/common");
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );

      let caught: unknown;
      try {
        await controller.listRuns(
          "wf-1",
          {
            startedAfter: "2026-05-25T00:00:00.000Z",
            startedBefore: "2026-05-24T00:00:00.000Z",
          },
          mockReq(),
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(BadRequestException);
      const bre = caught as InstanceType<typeof BadRequestException>;
      const response = bre.getResponse() as { message: string };
      expect(response.message).toBe(
        "startedAfter must be before startedBefore",
      );
      expect(temporalClient.listRunsForWorkflow).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------------
    // Scenario 6 (auth): non-member → 403, no Temporal call
    // ---------------------------------------------------------------------
    it("Scenario 6 (auth): throws ForbiddenException when caller cannot access the workflow's group", async () => {
      const req = {
        protocol: "http",
        headers: { host: "localhost:3002" },
        resolvedIdentity: identityWithGroups({
          "other-group": GroupRole.MEMBER,
        }),
      } as unknown as Request;
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );

      await expect(controller.listRuns("wf-1", {}, req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(temporalClient.listRunsForWorkflow).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------------
    // Scenario 6 (in-flight): running executions yield no endedAt
    // ---------------------------------------------------------------------
    it("Scenario 6 (running): omits endedAt when the execution is still running", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );
      (temporalClient.listRunsForWorkflow as jest.Mock).mockResolvedValue({
        executions: [
          buildExecution({
            runId: "run-in-flight",
            status: "Running",
            endedAt: null,
          }),
        ],
        nextCursor: null,
      });
      (temporalClient.getRunInput as jest.Mock).mockResolvedValue({
        initialCtx: { documentUrl: "blob://group-1/scan.pdf" },
        workflowLineageId: "wf-1",
      });

      const result = await controller.listRuns("wf-1", {}, mockReq());

      expect(result.runs).toHaveLength(1);
      expect(result.runs[0].status).toBe("running");
      expect(result.runs[0].endedAt).toBeUndefined();
    });

    // ---------------------------------------------------------------------
    // Scenario 6 (best-effort summary): getRunInput failures drop the
    // summary for that row but don't poison the whole page.
    // ---------------------------------------------------------------------
    it("Scenario 6 (best-effort summary): a getRunInput failure drops just that row's inputCtxSummary, not the page", async () => {
      workflowService.resolveLineageAndVersion.mockResolvedValue(
        mockWorkflowInfo,
      );
      (temporalClient.listRunsForWorkflow as jest.Mock).mockResolvedValue({
        executions: [
          buildExecution({ runId: "run-ok" }),
          buildExecution({ runId: "run-failed-input" }),
        ],
        nextCursor: null,
      });
      (temporalClient.getRunInput as jest.Mock).mockImplementation(
        (id: string) => {
          if (id === "run-failed-input") {
            return Promise.reject(new Error("retention cleaned"));
          }
          return Promise.resolve({
            initialCtx: { customerId: "cust-ok" },
            workflowLineageId: "wf-1",
          });
        },
      );

      const result = await controller.listRuns("wf-1", {}, mockReq());

      expect(result.runs).toHaveLength(2);
      expect(result.runs[0].inputCtxSummary).toEqual({ customerId: "cust-ok" });
      expect(result.runs[1].inputCtxSummary).toBeUndefined();
    });
  });
});
