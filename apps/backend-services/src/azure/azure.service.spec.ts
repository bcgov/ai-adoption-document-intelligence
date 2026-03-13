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
    // @ts-ignore
    expect(service["apiKey"]).toBe("secret-key");
  });

  it("should return the client instance", () => {
    expect(service.getClient()).toBeDefined();
  });

  describe("checkOperationStatus", () => {
    it("should call fetch with correct headers", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({ status: "succeeded" }),
      });
      // @ts-ignore
      global.fetch = mockFetch;
      const url = "https://test.com/operation";
      await service.checkOperationStatus(url);
      expect(mockFetch).toHaveBeenCalledWith(url, {
        headers: { "api-key": "secret-key" },
      });
    });
  });

  describe("pollOperationUntilResolved", () => {
    it("should call onSuccess when status is succeeded", async () => {
      const url = "https://test.com/operation";
      const pollResp = {
        json: jest.fn().mockResolvedValue({ status: "succeeded" }),
      };
      const mockFetch = jest.fn().mockResolvedValue(pollResp);
      // @ts-ignore
      service.checkOperationStatus = mockFetch;
      const onSuccess = jest.fn();
      await service.pollOperationUntilResolved(url, onSuccess, undefined, {
        maxRetries: 2,
        intervalMs: 1,
      });
      expect(onSuccess).toHaveBeenCalledWith({ status: "succeeded" });
    });

    it("should call onFailure when status is failed", async () => {
      const url = "https://test.com/operation";
      const pollResp = {
        json: jest.fn().mockResolvedValue({ status: "failed" }),
      };
      const mockFetch = jest.fn().mockResolvedValue(pollResp);
      // @ts-ignore
      service.checkOperationStatus = mockFetch;
      const onFailure = jest.fn();
      await service.pollOperationUntilResolved(url, jest.fn(), onFailure, {
        maxRetries: 2,
        intervalMs: 1,
      });
      expect(onFailure).toHaveBeenCalledWith({ status: "failed" });
    });

    it("should retry until maxRetries if status is not succeeded or failed", async () => {
      const url = "https://test.com/operation";
      const pollResp = {
        json: jest.fn().mockResolvedValue({ status: "notStarted" }),
      };
      const mockFetch = jest.fn().mockResolvedValue(pollResp);
      // @ts-ignore
      service.checkOperationStatus = mockFetch;
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
