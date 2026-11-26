import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { AuditDbService, type AuditEventCreateData } from "./audit-db.service";

const baseData: AuditEventCreateData = {
  event_type: "TEST_EVENT",
  resource_type: "document",
  resource_id: "res-1",
  actor_id: "user-1",
  document_id: "doc-1",
  workflow_execution_id: "wf-1",
  group_id: "grp-1",
  request_id: "req-1",
};

describe("AuditDbService", () => {
  let service: AuditDbService;
  let mockAuditEvent: { create: jest.Mock; createMany: jest.Mock };
  let mockPrisma: {
    auditEvent: { create: jest.Mock; createMany: jest.Mock };
  };

  beforeEach(async () => {
    mockAuditEvent = {
      create: jest.fn().mockResolvedValue(undefined),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    mockPrisma = { auditEvent: mockAuditEvent };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditDbService,
        {
          provide: PrismaService,
          useValue: { prisma: mockPrisma },
        },
      ],
    }).compile();

    service = module.get<AuditDbService>(AuditDbService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("createAuditEvent", () => {
    it("should create an audit event using this.prisma when no tx is provided", async () => {
      await service.createAuditEvent(baseData);

      expect(mockAuditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          event_type: "TEST_EVENT",
          resource_type: "document",
          resource_id: "res-1",
        }),
      });
    });

    it("should use the provided transaction client instead of this.prisma", async () => {
      const txAuditEvent = { create: jest.fn().mockResolvedValue(undefined) };
      const mockTx = { auditEvent: txAuditEvent } as unknown as Parameters<
        typeof service.createAuditEvent
      >[1];

      await service.createAuditEvent(baseData, mockTx);

      expect(txAuditEvent.create).toHaveBeenCalled();
      expect(mockAuditEvent.create).not.toHaveBeenCalled();
    });

    it("should pass payload as-is when a payload is provided", async () => {
      const dataWithPayload: AuditEventCreateData = {
        ...baseData,
        payload: { key: "value" },
      };

      await service.createAuditEvent(dataWithPayload);

      expect(mockAuditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ payload: { key: "value" } }),
      });
    });

    it("should pass undefined payload when no payload is provided", async () => {
      const dataWithoutPayload: AuditEventCreateData = {
        ...baseData,
        payload: undefined,
      };

      await service.createAuditEvent(dataWithoutPayload);

      expect(mockAuditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ payload: undefined }),
      });
    });
  });

  describe("createAuditEvents", () => {
    it("should create every event in one createMany call using this.prisma when no tx is provided", async () => {
      const second: AuditEventCreateData = {
        ...baseData,
        event_type: "SECOND_EVENT",
        resource_id: "res-2",
      };

      await service.createAuditEvents([baseData, second]);

      expect(mockAuditEvent.createMany).toHaveBeenCalledTimes(1);
      expect(mockAuditEvent.create).not.toHaveBeenCalled();
      expect(mockAuditEvent.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            event_type: "TEST_EVENT",
            resource_id: "res-1",
          }),
          expect.objectContaining({
            event_type: "SECOND_EVENT",
            resource_id: "res-2",
          }),
        ],
      });
    });

    it("should use the provided transaction client instead of this.prisma", async () => {
      const txAuditEvent = {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      };
      const mockTx = { auditEvent: txAuditEvent } as unknown as Parameters<
        typeof service.createAuditEvents
      >[1];

      await service.createAuditEvents([baseData, baseData], mockTx);

      expect(txAuditEvent.createMany).toHaveBeenCalled();
      expect(mockAuditEvent.createMany).not.toHaveBeenCalled();
    });

    it("should do nothing for an empty list", async () => {
      await service.createAuditEvents([]);

      expect(mockAuditEvent.createMany).not.toHaveBeenCalled();
    });

    it("should pass payload as-is per event, same as createAuditEvent", async () => {
      const withPayload: AuditEventCreateData = {
        ...baseData,
        payload: { key: "value" },
      };

      await service.createAuditEvents([withPayload]);

      expect(mockAuditEvent.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ payload: { key: "value" } })],
      });
    });
  });
});
