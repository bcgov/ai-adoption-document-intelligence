import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { DatabaseService } from "../database/database.service";
import { DocumentController } from "./document.controller";
import { DocumentModule } from "./document.module";
import { DocumentService } from "./document.service";

describe("DocumentModule", () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [DocumentModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: jest.fn(() => "/tmp/storage"),
      })
      .overrideProvider(DatabaseService)
      .useValue({
        createDocument: jest.fn(),
        findDocument: jest.fn(),
        findAllDocuments: jest.fn(),
      })
      .compile();
  });

  it("should be defined", () => {
    expect(module).toBeDefined();
  });

  it("should provide DocumentService", () => {
    const service = module.get<DocumentService>(DocumentService);
    expect(service).toBeDefined();
  });

  it("should provide DocumentController", () => {
    const controller = module.get<DocumentController>(DocumentController);
    expect(controller).toBeDefined();
  });

  it("should export DocumentService", () => {
    const service = module.get<DocumentService>(DocumentService);
    expect(service).toBeInstanceOf(DocumentService);
  });
});
