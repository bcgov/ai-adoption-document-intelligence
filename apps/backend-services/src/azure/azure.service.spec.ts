import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { AzureService } from "./azure.service";

describe("AzureService", () => {
  let service: AzureService;
  let configService: ConfigService;

  beforeEach(async () => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
          return "https://test.com";
        if (key === "AZURE_DOCUMENT_INTELLIGENCE_API_KEY") return "secret-key";
        return undefined;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ConfigService, useValue: configService },
        { provide: AppLoggerService, useValue: mockAppLogger },
        AzureService,
      ],
    }).compile();
    service = module.get<AzureService>(AzureService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should initialize with correct endpoint and apiKey", () => {
    expect(service.getEndpoint()).toBe("https://test.com");
    expect(service["apiKey"]).toBe("secret-key");
  });

  it("should return the client instance", () => {
    expect(service.getClient()).toBeDefined();
  });

  describe("checkOperationStatus", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should fetch the operationLocation URL directly and return the result", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({ status: "succeeded" }),
      });
      jest.spyOn(global, "fetch").mockImplementation(mockFetch as never);

      const url =
        "https://test.com/documentintelligence/documentModels/prebuilt-layout/analyzeResults/12345?api-version=2024-11-30";
      const result = await service.checkOperationStatus(url);
      expect(mockFetch).toHaveBeenCalledWith(url, {
        headers: { "api-key": expect.any(String) },
        redirect: "error",
      });
      expect(result).toEqual({ status: "succeeded" });
    });

    it("should fetch analyzeResults URLs directly (not reconstruct as /operations)", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({ status: "running" }),
      });
      jest.spyOn(global, "fetch").mockImplementation(mockFetch as never);

      const analyzeUrl =
        "https://test.com/documentintelligence/documentModels/prebuilt-layout/analyzeResults/abc-123";
      await service.checkOperationStatus(analyzeUrl);
      expect(mockFetch).toHaveBeenCalledWith(
        analyzeUrl,
        expect.objectContaining({ redirect: "error" }),
      );
    });

    it("should fetch training operation URLs with underscore IDs directly", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        json: jest
          .fn()
          .mockResolvedValue({ status: "succeeded", modelInfo: {} }),
      });
      jest.spyOn(global, "fetch").mockImplementation(mockFetch as never);

      const url =
        "https://test.com/sdpr-invoice-automation/documentintelligence/operations/31389396645_e6860cb5-768d-4509-ae59-890faaadb2d9";
      await service.checkOperationStatus(url);
      expect(mockFetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({ redirect: "error" }),
      );
    });

    it("rejects invalid operationLocation URL", async () => {
      await expect(service.checkOperationStatus("not-a-url")).rejects.toThrow(
        "Invalid operationLocation URL: not-a-url",
      );
    });

    it("rejects operationLocation when origin does not match endpoint", async () => {
      await expect(
        service.checkOperationStatus("https://evil.com/op"),
      ).rejects.toThrow(
        `operationLocation origin "https://evil.com" does not match expected Azure endpoint origin "https://test.com"`,
      );
    });

    it("rejects operationLocation when protocol is not https", async () => {
      await expect(
        service.checkOperationStatus("http://test.com/op"),
      ).rejects.toThrow(
        'operationLocation protocol "http:" is not allowed. Expected "https:"',
      );
    });

    it("rejects operationLocation when credentials are present", async () => {
      await expect(
        service.checkOperationStatus("https://user:pass@test.com/op"),
      ).rejects.toThrow("operationLocation must not include credentials");
    });
  });

  describe("pollOperationUntilResolved", () => {
    it("should call onSuccess when status is succeeded", async () => {
      const url = "https://test.com/operation";
      const mockFetch = jest
        .fn()
        .mockResolvedValue({ status: "succeeded" } as never);
      service.checkOperationStatus = mockFetch as never;
      const onSuccess = jest.fn();
      await service.pollOperationUntilResolved(url, onSuccess, undefined, {
        maxRetries: 2,
        intervalMs: 1,
      });
      expect(onSuccess).toHaveBeenCalledWith({ status: "succeeded" });
    });

    it("should call onFailure when status is failed", async () => {
      const url = "https://test.com/operation";
      const mockFetch = jest
        .fn()
        .mockResolvedValue({ status: "failed" } as never);
      service.checkOperationStatus = mockFetch as never;
      const onFailure = jest.fn();
      await service.pollOperationUntilResolved(url, jest.fn(), onFailure, {
        maxRetries: 2,
        intervalMs: 1,
      });
      expect(onFailure).toHaveBeenCalledWith({ status: "failed" });
    });

    it("should retry until maxRetries if status is not succeeded or failed", async () => {
      const url = "https://test.com/operation";
      const mockFetch = jest
        .fn()
        .mockResolvedValue({ status: "notStarted" } as never);
      service.checkOperationStatus = mockFetch as never;
      const onSuccess = jest.fn();
      const onFailure = jest.fn();
      await service.pollOperationUntilResolved(url, onSuccess, onFailure, {
        maxRetries: 2,
        intervalMs: 1,
      });
      expect(onSuccess).not.toHaveBeenCalled();
      // onFailure is not called if status never becomes failed, only logs
    });

    it("should throw if operationLocation is not a valid URL", async () => {
      await expect(
        service.pollOperationUntilResolved("not-a-url", jest.fn()),
      ).rejects.toThrow("Invalid operationLocation URL: not-a-url");
    });

    it("should throw if operationLocation origin does not match the configured endpoint", async () => {
      const url = "https://attacker.com/operation";
      await expect(
        service.pollOperationUntilResolved(url, jest.fn()),
      ).rejects.toThrow(
        `operationLocation origin "https://attacker.com" does not match expected Azure endpoint origin "https://test.com"`,
      );
    });
  });
});
