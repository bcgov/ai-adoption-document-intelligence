import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { DatabaseModule } from "../database/database.module";
import { DocumentController } from "./document.controller";
import { DocumentModule } from "./document.module";
import { DocumentService } from "./document.service";

describe("DocumentModule", () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot(), DocumentModule, DatabaseModule],
    }).compile();
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
