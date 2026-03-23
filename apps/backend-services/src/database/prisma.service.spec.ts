import { Prisma } from "@generated/client";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { AppLoggerService } from "@/logging/app-logger.service";
import { PrismaService } from "./prisma.service";

describe("PrismaService", () => {
  let service: PrismaService;
  let mockTransaction: jest.Mock;

  beforeEach(async () => {
    mockTransaction = jest.fn(
      (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        fn({} as Prisma.TransactionClient),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue("postgresql://localhost:5432/test"),
          },
        },
        {
          provide: AppLoggerService,
          useValue: {
            warn: jest.fn(),
            error: jest.fn(),
            log: jest.fn(),
            debug: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
    // Replace the underlying prisma.$transaction with our mock
    (service.prisma as unknown as { $transaction: jest.Mock }).$transaction =
      mockTransaction;
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("transaction()", () => {
    it("should delegate to this.prisma.$transaction", async () => {
      const fn = jest.fn().mockResolvedValue("result");

      const result = await service.transaction(fn);

      expect(result).toBe("result");
      expect(mockTransaction).toHaveBeenCalledWith(fn);
    });

    it("should pass the TransactionClient to the provided function", async () => {
      const capturedTx: Prisma.TransactionClient[] = [];
      const fn = jest
        .fn()
        .mockImplementation((tx: Prisma.TransactionClient) => {
          capturedTx.push(tx);
          return Promise.resolve("done");
        });

      await service.transaction(fn);

      expect(capturedTx).toHaveLength(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should propagate errors thrown by the provided function", async () => {
      mockTransaction.mockImplementation(
        (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          fn({} as Prisma.TransactionClient),
      );
      const fn = jest.fn().mockRejectedValue(new Error("tx error"));

      await expect(service.transaction(fn)).rejects.toThrow("tx error");
    });

    it("should return the result of the provided function", async () => {
      const expectedResult = { id: "test-id", value: 42 };
      const fn = jest.fn().mockResolvedValue(expectedResult);

      const result = await service.transaction(fn);

      expect(result).toEqual(expectedResult);
    });
  });
});
