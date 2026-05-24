import { GroupRole } from "@generated/client";
import { ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Request } from "express";
import { AppLoggerService } from "@/logging/app-logger.service";
import { TemporalClientService } from "@/temporal/temporal-client.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import type { GraphWorkflowConfig } from "./graph-workflow-types";
import { WorkflowController } from "./workflow.controller";
import {
  CreateWorkflowDto,
  WorkflowInfo,
  WorkflowService,
} from "./workflow.service";

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
    } as unknown as jest.Mocked<WorkflowService>;

    temporalClient = {
      startGraphWorkflow: jest.fn(),
    } as unknown as jest.Mocked<TemporalClientService>;

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
});
