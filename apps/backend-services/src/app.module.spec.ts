import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { of } from "rxjs";
import { AppModule } from "./app.module";
import { DatabaseService } from "./database/database.service";

describe("AppModule", () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: jest.fn((key: string) => {
          const config: Record<string, string> = {
            DATABASE_URL: "mock-db-url",
            AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: "https://test.azure.com",
            AZURE_DOCUMENT_INTELLIGENCE_API_KEY: "test-key",
            STORAGE_PATH: "/tmp/storage",
            RABBITMQ_URL: "amqp://test:5672",
            RABBITMQ_EXCHANGE: "test_exchange",
            RABBITMQ_ROUTING_KEY: "test.key",
          };
          return config[key];
        }),
      })
      .overrideProvider(DatabaseService)
      .useValue({
        createDocument: jest.fn(),
        findDocument: jest.fn(),
        findAllDocuments: jest.fn(),
        updateDocument: jest.fn(),
        upsertOcrResult: jest.fn(),
      })
      .overrideProvider(HttpService)
      .useValue({
        post: jest.fn(() => of({})),
        get: jest.fn(() => of({})),
      })
      .compile();
  });

  it("should be defined", () => {
    expect(module).toBeDefined();
  });

  it("should have all required modules loaded", () => {
    // Verify module compiled successfully with all dependencies
    expect(module).toBeTruthy();
  });
});
