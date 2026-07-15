import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AuditService } from "@/audit/audit.service";
import { PrismaService } from "@/database/prisma.service";
import { BillingConfigService } from "./billing-config.service";

const mockTx = {
  groupBillingConfig: {
    upsert: jest.fn(),
  },
};

const mockPrismaService = {
  prisma: {
    groupBillingConfig: {
      findUnique: jest.fn(),
    },
    group: {
      findUnique: jest.fn(),
    },
  },
  transaction: jest
    .fn()
    .mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) =>
      cb(mockTx),
    ),
};

const mockAuditService = {
  recordEvent: jest.fn().mockResolvedValue(undefined),
};

describe("BillingConfigService", () => {
  let service: BillingConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTx.groupBillingConfig.upsert.mockReset();
    mockPrismaService.transaction.mockImplementation(
      (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingConfigService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<BillingConfigService>(BillingConfigService);
  });

  describe("getBillingConfig", () => {
    it("returns null when no config row exists", async () => {
      mockPrismaService.prisma.groupBillingConfig.findUnique.mockResolvedValue(
        null,
      );
      const result = await service.getBillingConfig("group-1");
      expect(result).toBeNull();
    });

    it("returns DTO when config row exists with a cap", async () => {
      const now = new Date();
      mockPrismaService.prisma.groupBillingConfig.findUnique.mockResolvedValue({
        id: "cfg-1",
        group_id: "group-1",
        monthly_cap_dollars: { toNumber: () => 500 },
        cap_configured_by: "admin-user",
        cap_configured_at: now,
        created_at: now,
      });

      const result = await service.getBillingConfig("group-1");
      expect(result).toMatchObject({
        id: "cfg-1",
        group_id: "group-1",
        monthly_cap_dollars: 500,
        cap_configured_by: "admin-user",
      });
    });

    it("returns DTO with null cap when monthly_cap_dollars is null", async () => {
      const now = new Date();
      mockPrismaService.prisma.groupBillingConfig.findUnique.mockResolvedValue({
        id: "cfg-1",
        group_id: "group-1",
        monthly_cap_dollars: null,
        cap_configured_by: "admin-user",
        cap_configured_at: now,
        created_at: now,
      });

      const result = await service.getBillingConfig("group-1");
      expect(result?.monthly_cap_dollars).toBeNull();
    });
  });

  describe("upsertBillingCap", () => {
    it("throws NotFoundException when group does not exist", async () => {
      mockPrismaService.prisma.group.findUnique.mockResolvedValue(null);
      await expect(
        service.upsertBillingCap("nonexistent", 100, "admin-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("upserts config and returns DTO with new cap", async () => {
      const now = new Date();
      mockPrismaService.prisma.group.findUnique.mockResolvedValue({
        id: "group-1",
      });
      mockTx.groupBillingConfig.upsert.mockResolvedValue({
        id: "cfg-1",
        group_id: "group-1",
        monthly_cap_dollars: { toNumber: () => 250 },
        cap_configured_by: "admin-1",
        cap_configured_at: now,
        created_at: now,
      });

      const result = await service.upsertBillingCap("group-1", 250, "admin-1");
      expect(result.monthly_cap_dollars).toBe(250);
      expect(result.cap_configured_by).toBe("admin-1");
      expect(mockTx.groupBillingConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { group_id: "group-1" },
          create: expect.objectContaining({
            group_id: "group-1",
            monthly_cap_dollars: 250,
            cap_configured_by: "admin-1",
          }),
          update: expect.objectContaining({
            monthly_cap_dollars: 250,
            cap_configured_by: "admin-1",
          }),
        }),
      );
    });

    it("sets monthly_cap_dollars to null when clearing the cap", async () => {
      const now = new Date();
      mockPrismaService.prisma.group.findUnique.mockResolvedValue({
        id: "group-1",
      });
      mockTx.groupBillingConfig.upsert.mockResolvedValue({
        id: "cfg-1",
        group_id: "group-1",
        monthly_cap_dollars: null,
        cap_configured_by: "admin-1",
        cap_configured_at: now,
        created_at: now,
      });

      const result = await service.upsertBillingCap("group-1", null, "admin-1");
      expect(result.monthly_cap_dollars).toBeNull();
      expect(mockTx.groupBillingConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ monthly_cap_dollars: null }),
          update: expect.objectContaining({ monthly_cap_dollars: null }),
        }),
      );
    });

    it("treats undefined monthly_cap_dollars as null", async () => {
      const now = new Date();
      mockPrismaService.prisma.group.findUnique.mockResolvedValue({
        id: "group-1",
      });
      mockTx.groupBillingConfig.upsert.mockResolvedValue({
        id: "cfg-1",
        group_id: "group-1",
        monthly_cap_dollars: null,
        cap_configured_by: "admin-1",
        cap_configured_at: now,
        created_at: now,
      });

      await service.upsertBillingCap("group-1", undefined, "admin-1");
      expect(mockTx.groupBillingConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ monthly_cap_dollars: null }),
        }),
      );
    });
  });
});
