import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { QueueService } from "./queue.service";

describe("QueueService", () => {
  let service: QueueService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                RABBITMQ_URL: "amqp://test:5672",
                RABBITMQ_EXCHANGE: "test_exchange",
                RABBITMQ_ROUTING_KEY: "test.key",
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("constructor", () => {
    it("should initialize with config values", () => {
      expect(configService.get).toHaveBeenCalledWith("RABBITMQ_URL");
      expect(configService.get).toHaveBeenCalledWith("RABBITMQ_EXCHANGE");
      expect(configService.get).toHaveBeenCalledWith("RABBITMQ_ROUTING_KEY");
    });

    it("should use default values when config is not provided", async () => {
      const moduleWithDefaults: TestingModule = await Test.createTestingModule({
        providers: [
          QueueService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(() => undefined),
            },
          },
        ],
      }).compile();

      const serviceWithDefaults =
        moduleWithDefaults.get<QueueService>(QueueService);
      expect(serviceWithDefaults).toBeDefined();
    });
  });

  describe("publishDocumentUploaded", () => {
    it("should publish a message successfully", async () => {
      const message = {
        documentId: "doc-123",
        filePath: "/path/to/file.pdf",
        fileType: "pdf",
        metadata: { source: "test" },
        timestamp: new Date(),
      };

      const result = await service.publishDocumentUploaded(message);
      expect(result).toBe(true);
    });

    it("should handle message without metadata", async () => {
      const message = {
        documentId: "doc-456",
        filePath: "/path/to/file.jpg",
        fileType: "image",
        timestamp: new Date(),
      };

      const result = await service.publishDocumentUploaded(message);
      expect(result).toBe(true);
    });
  });

  describe("connect", () => {
    it("should connect successfully", async () => {
      await expect(service.connect()).resolves.toBeUndefined();
    });
  });

  describe("disconnect", () => {
    it("should disconnect successfully", async () => {
      await expect(service.disconnect()).resolves.toBeUndefined();
    });
  });
});
