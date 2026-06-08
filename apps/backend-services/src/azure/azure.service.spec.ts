import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { AzureService } from "./azure.service";
import { MOCK_DOCUMENT_INTELLIGENCE_ENDPOINT } from "./mock-document-intelligence.constants";

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

    it("rejects operationLocation when path is not a Document Intelligence path", async () => {
      await expect(
        service.checkOperationStatus("https://test.com/other/path/result"),
      ).rejects.toThrow(
        `operationLocation path "/other/path/result" is not an allowed Azure Document Intelligence endpoint path`,
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

  describe("checkOperationStatusById", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should construct URL from full endpoint and return parsed body", async () => {
      const mockBody = { status: "succeeded" };
      jest.spyOn(global, "fetch").mockResolvedValue({
        json: async () => mockBody,
        status: 200,
      } as Response);
      const result = await service.checkOperationStatusById("my-uuid");
      expect(fetch).toHaveBeenCalledWith(
        "https://test.com/documentintelligence/operations/my-uuid?api-version=2024-11-30",
        expect.objectContaining({ headers: { "api-key": "secret-key" } }),
      );
      expect(result).toEqual(mockBody);
    });

    it("should preserve path suffix in endpoint when building URL", async () => {
      // Simulate a path-suffixed APIM endpoint
      (configService.get as jest.Mock).mockImplementation((key: string) => {
        if (key === "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
          return "https://apim.example.com/myapi";
        if (key === "AZURE_DOCUMENT_INTELLIGENCE_API_KEY") return "key";
        return undefined;
      });
      const module2 = await Test.createTestingModule({
        providers: [
          { provide: ConfigService, useValue: configService },
          { provide: AppLoggerService, useValue: mockAppLogger },
          AzureService,
        ],
      }).compile();
      const svc2 = module2.get<AzureService>(AzureService);
      jest.spyOn(global, "fetch").mockResolvedValue({
        json: async () => ({}),
        status: 200,
      } as Response);
      await svc2.checkOperationStatusById("abc-123");
      expect(fetch).toHaveBeenCalledWith(
        "https://apim.example.com/myapi/documentintelligence/operations/abc-123?api-version=2024-11-30",
        expect.anything(),
      );
    });
  });

  describe("checkClassifierExists", () => {
    it("should return true when the classifier exists", async () => {
      const mockPath = jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ status: "200" }),
      });
      (service as any).client = { path: mockPath };
      const result = await service.checkClassifierExists("gid__clf");
      expect(mockPath).toHaveBeenCalledWith("/documentClassifiers/gid__clf");
      expect(result).toBe(true);
    });

    it("should return false when the classifier does not exist", async () => {
      const mockPath = jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ status: "404" }),
      });
      (service as any).client = { path: mockPath };
      const result = await service.checkClassifierExists("gid__clf");
      expect(result).toBe(false);
    });
  });

  describe("DOCUMENT_INTELLIGENCE_MODE=mock", () => {
    beforeEach(async () => {
      configService = {
        get: jest.fn((key: string) => {
          if (key === "DOCUMENT_INTELLIGENCE_MODE") return "mock";
          if (key === "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
            return "https://unused.example.com";
          if (key === "AZURE_DOCUMENT_INTELLIGENCE_API_KEY") return "unused";
          return undefined;
        }),
      } as unknown as ConfigService;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          { provide: ConfigService, useValue: configService },
          { provide: AppLoggerService, useValue: mockAppLogger },
          AzureService,
        ],
      }).compile();
      service = module.get<AzureService>(AzureService);
    });

    it("uses fixed mock endpoint and reports mock mode", () => {
      expect(service.isMockMode()).toBe(true);
      expect(service.getEndpoint()).toBe(MOCK_DOCUMENT_INTELLIGENCE_ENDPOINT);
    });

    it("checkOperationStatus returns deterministic succeeded classification body", async () => {
      const result = await service.checkOperationStatus(
        `${MOCK_DOCUMENT_INTELLIGENCE_ENDPOINT}/documentintelligence/analyzeResults/mock-op`,
      );
      expect(result.status).toBe("succeeded");
      expect(
        (result.analyzeResult as { modelId?: string } | undefined)?.modelId,
      ).toBe("mock-classifier");
    });

    it("pollOperationUntilResolved invokes onSuccess without live polling loop", async () => {
      const onSuccess = jest.fn();
      await service.pollOperationUntilResolved(
        `${MOCK_DOCUMENT_INTELLIGENCE_ENDPOINT}/documentintelligence/analyzeResults/mock-op`,
        onSuccess,
        undefined,
        { maxRetries: 0, intervalMs: 1 },
      );
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess.mock.calls[0][0].status).toBe("succeeded");
    });
  });
});
