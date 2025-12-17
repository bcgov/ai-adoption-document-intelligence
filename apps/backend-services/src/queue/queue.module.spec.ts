import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { QueueModule } from "./queue.module";
import { QueueService } from "./queue.service";

describe("QueueModule", () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [QueueModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: jest.fn((key: string) => {
          const config: Record<string, string> = {
            RABBITMQ_URL: "amqp://test:5672",
            RABBITMQ_EXCHANGE: "test_exchange",
            RABBITMQ_ROUTING_KEY: "test.key",
          };
          return config[key];
        }),
      })
      .compile();
  });

  it("should be defined", () => {
    expect(module).toBeDefined();
  });

  it("should provide QueueService", () => {
    const service = module.get<QueueService>(QueueService);
    expect(service).toBeDefined();
  });

  it("should export QueueService", () => {
    const service = module.get<QueueService>(QueueService);
    expect(service).toBeInstanceOf(QueueService);
  });
});
