import { CorrectionAction } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { HitlAggregationService } from "./hitl-aggregation.service";

describe("HitlAggregationService", () => {
  let service: HitlAggregationService;

  const mockPrisma = {
    prisma: {
      fieldCorrection: {
        findMany: jest.fn(),
      },
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HitlAggregationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(HitlAggregationService);
  });

  it("defaults to confirmed and corrected HITL rows", async () => {
    mockPrisma.prisma.fieldCorrection.findMany.mockResolvedValueOnce([]);

    await service.getAggregatedCorrections({});

    expect(mockPrisma.prisma.fieldCorrection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: {
            in: [CorrectionAction.corrected],
          },
        }),
      }),
    );
  });

  it("respects explicit action filters", async () => {
    mockPrisma.prisma.fieldCorrection.findMany.mockResolvedValueOnce([]);

    await service.getAggregatedCorrections({
      actions: [CorrectionAction.flagged],
    });

    expect(mockPrisma.prisma.fieldCorrection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: {
            in: [CorrectionAction.flagged],
          },
        }),
      }),
    );
  });

  it("scopes field_key and non-null values in the Prisma where clause", async () => {
    mockPrisma.prisma.fieldCorrection.findMany.mockResolvedValueOnce([
      {
        field_key: "invoice_number",
        original_value: "INV-1",
        corrected_value: "INV-123",
        action: CorrectionAction.corrected,
        original_conf: 0.9,
        created_at: new Date(),
        session_id: "s1",
        session: { document_id: "d1" },
      },
    ]);

    const result = await service.getAggregatedCorrections({});

    expect(mockPrisma.prisma.fieldCorrection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          original_value: { not: null },
          corrected_value: { not: null },
          AND: [{ field_key: { not: { startsWith: "_" } } }],
        }),
      }),
    );
    expect(result.corrections).toHaveLength(1);
    expect(result.corrections[0].fieldKey).toBe("invoice_number");
    expect(result.total).toBe(1);
  });

  it("adds field_key in filter when fieldKeys is set", async () => {
    mockPrisma.prisma.fieldCorrection.findMany.mockResolvedValueOnce([]);

    await service.getAggregatedCorrections({
      fieldKeys: ["a", "b"],
    });

    expect(mockPrisma.prisma.fieldCorrection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            { field_key: { not: { startsWith: "_" } } },
            { field_key: { in: ["a", "b"] } },
          ],
        }),
      }),
    );
  });
});
