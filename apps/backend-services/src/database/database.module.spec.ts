import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { DatabaseModule } from "./database.module";
import { DatabaseService } from "./database.service";

describe("DatabaseModule", () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [DatabaseModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: jest.fn(() => "mock-db-url"),
      })
      .compile();
  });

  it("should be defined", () => {
    expect(module).toBeDefined();
  });

  it("should provide DatabaseService", () => {
    const service = module.get<DatabaseService>(DatabaseService);
    expect(service).toBeDefined();
  });

  it("should export DatabaseService", () => {
    const service = module.get<DatabaseService>(DatabaseService);
    expect(service).toBeInstanceOf(DatabaseService);
  });
});
