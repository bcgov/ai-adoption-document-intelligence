import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { of } from "rxjs";
import { DatabaseService } from "@/database/database.service";
import { OcrModule } from "./ocr.module";
import { OcrService } from "./ocr.service";

describe("OcrModule", () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [OcrModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: jest.fn((key: string) => {
          const config: Record<string, string> = {
            AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: "https://test.azure.com",
            AZURE_DOCUMENT_INTELLIGENCE_API_KEY: "test-key",
            STORAGE_PATH: "/tmp/storage",
          };
          return config[key];
        }),
      })
      .overrideProvider(DatabaseService)
      .useValue({
        findDocument: jest.fn(),
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

  it("should provide OcrService", () => {
    const service = module.get<OcrService>(OcrService);
    expect(service).toBeDefined();
  });

  it("should export OcrService", () => {
    const service = module.get<OcrService>(OcrService);
    expect(service).toBeInstanceOf(OcrService);
  });
});
