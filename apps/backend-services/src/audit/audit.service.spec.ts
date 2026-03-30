import { Test, TestingModule } from "@nestjs/testing";
import { AppLoggerService } from "@/logging/app-logger.service";
import * as requestContextModule from "@/logging/request-context";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { AuditService } from "./audit.service";
import type { CreateAuditEventInput } from "./audit.types";
import { AuditDbService } from "./audit-db.service";

describe("AuditService", () => {
  let service: AuditService;
  const mockAuditDb = {
    createAuditEvent: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest
      .spyOn(requestContextModule, "getRequestContext")
      .mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: AuditDbService, useValue: mockAuditDb },
        { provide: AppLoggerService, useValue: mockAppLogger },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("recordEvent - single event", () => {
    it("should call createAuditEvent with the provided event fields", async () => {
      mockAuditDb.createAuditEvent.mockResolvedValue(undefined);

      const event: CreateAuditEventInput = {
        event_type: "DOC_CREATED",
        resource_type: "document",
        resource_id: "doc-1",
        actor_id: "user-1",
        document_id: "doc-1",
        workflow_execution_id: "wf-1",
        group_id: "grp-1",
        request_id: "req-1",
        payload: { key: "val" },
      };

      await service.recordEvent(event);

      expect(mockAuditDb.createAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: "DOC_CREATED",
          actor_id: "user-1",
          document_id: "doc-1",
          workflow_execution_id: "wf-1",
          group_id: "grp-1",
          request_id: "req-1",
        }),
      );
    });

    it("should set actor_id to null when omitted and no request context", async () => {
      mockAuditDb.createAuditEvent.mockResolvedValue(undefined);

      await service.recordEvent({
        event_type: "TEST",
        resource_type: "document",
        resource_id: "res-1",
      });

      expect(mockAuditDb.createAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ actor_id: undefined }),
      );
    });

    it("should use userId from request context when actor_id is omitted", async () => {
      jest
        .spyOn(requestContextModule, "getRequestContext")
        .mockReturnValue({ requestId: "req-ctx-1", actorId: undefined });
      mockAuditDb.createAuditEvent.mockResolvedValue(undefined);

      await service.recordEvent({
        event_type: "TEST",
        resource_type: "document",
        resource_id: "res-1",
      });

      expect(mockAuditDb.createAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ actor_id: undefined }),
      );
    });

    it("should use requestId from context when request_id is omitted", async () => {
      jest
        .spyOn(requestContextModule, "getRequestContext")
        .mockReturnValue({ requestId: "ctx-req-1", actorId: "u" });
      mockAuditDb.createAuditEvent.mockResolvedValue(undefined);

      await service.recordEvent({
        event_type: "TEST",
        resource_type: "document",
        resource_id: "res-1",
      });

      expect(mockAuditDb.createAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ request_id: "ctx-req-1" }),
      );
    });

    it("should set optional fields to null when omitted and context has no userId", async () => {
      jest
        .spyOn(requestContextModule, "getRequestContext")
        .mockReturnValue({ requestId: "ctx-req-1" });
      mockAuditDb.createAuditEvent.mockResolvedValue(undefined);

      await service.recordEvent({
        event_type: "TEST",
        resource_type: "document",
        resource_id: "res-1",
      });

      expect(mockAuditDb.createAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          actor_id: undefined,
          document_id: null,
          workflow_execution_id: null,
          group_id: null,
        }),
      );
    });
  });

  describe("recordEvent - array of events", () => {
    it("should process an array of events, calling createAuditEvent for each", async () => {
      mockAuditDb.createAuditEvent.mockResolvedValue(undefined);

      const events: CreateAuditEventInput[] = [
        { event_type: "EVT_1", resource_type: "doc", resource_id: "r1" },
        { event_type: "EVT_2", resource_type: "doc", resource_id: "r2" },
      ];

      await service.recordEvent(events);

      expect(mockAuditDb.createAuditEvent).toHaveBeenCalledTimes(2);
    });

    it("should process an empty array without calling createAuditEvent", async () => {
      await service.recordEvent([]);

      expect(mockAuditDb.createAuditEvent).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should log a warning and not throw when createAuditEvent rejects with an Error", async () => {
      mockAuditDb.createAuditEvent.mockRejectedValue(
        new Error("DB write failed"),
      );

      await expect(
        service.recordEvent({
          event_type: "FAIL",
          resource_type: "doc",
          resource_id: "r1",
        }),
      ).resolves.toBeUndefined();

      expect(mockAppLogger.warn).toHaveBeenCalledWith(
        "Audit event write failed (non-fatal)",
        expect.objectContaining({ error: "DB write failed" }),
      );
    });

    it("should log a warning and not throw when createAuditEvent rejects with a non-Error value", async () => {
      mockAuditDb.createAuditEvent.mockRejectedValue("string error");

      await expect(
        service.recordEvent({
          event_type: "FAIL",
          resource_type: "doc",
          resource_id: "r1",
        }),
      ).resolves.toBeUndefined();

      expect(mockAppLogger.warn).toHaveBeenCalledWith(
        "Audit event write failed (non-fatal)",
        expect.objectContaining({ error: "string error" }),
      );
    });
  });
});
