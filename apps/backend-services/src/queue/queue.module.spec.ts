import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { QueueModule } from "./queue.module";
import { QueueService } from "./queue.service";

describe("QueueModule", () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot(), QueueModule],
    }).compile();
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
