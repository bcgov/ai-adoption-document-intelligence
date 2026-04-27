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
    it("should poll Azure operation status using extracted operation id", async () => {
      const mockGet = jest.fn().mockResolvedValue({
        status: "200",
        headers: { "x-ms-original-url": "https://test.com/operations/12345" },
        body: { status: "succeeded" },
      });
      const mockPath = jest.fn().mockReturnValue({ get: mockGet });
      const clientPathSpy = jest.spyOn(service.getClient(), "path");
      clientPathSpy.mockImplementation(mockPath as never);

      const url =
        "https://test.com/documentintelligence/documentModels/prebuilt-layout/analyzeResults/12345?api-version=2024-11-30";
      await service.checkOperationStatus(url);
      expect(mockPath).toHaveBeenCalledWith(
        "/operations/{operationId}",
        "12345",
      );
      expect(mockGet).toHaveBeenCalled();
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

    it("rejects operationLocation path without supported operation id", async () => {
      await expect(
        service.checkOperationStatus("https://test.com/invalid/path"),
      ).rejects.toThrow(
        'operationLocation path "/invalid/path" does not contain a supported operation identifier',
      );
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
