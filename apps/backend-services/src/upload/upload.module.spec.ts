import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { DocumentService } from "../document/document.service";
import { QueueService } from "../queue/queue.service";
import { UploadController } from "./upload.controller";
import { UploadModule } from "./upload.module";

describe("UploadModule", () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [UploadModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: jest.fn(() => "/tmp/storage"),
      })
      .overrideProvider(DocumentService)
      .useValue({
        uploadDocument: jest.fn(),
        getDocument: jest.fn(),
      })
      .overrideProvider(QueueService)
      .useValue({
        publishDocumentUploaded: jest.fn(),
      })
      .compile();
  });

  it("should be defined", () => {
    expect(module).toBeDefined();
  });

  it("should provide UploadController", () => {
    const controller = module.get<UploadController>(UploadController);
    expect(controller).toBeDefined();
  });
});
