import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { DocumentModule } from "../document/document.module";
import { QueueModule } from "../queue/queue.module";
import { UploadController } from "./upload.controller";
import { UploadModule } from "./upload.module";

describe("UploadModule", () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        UploadModule,
        DocumentModule,
        QueueModule,
      ],
    }).compile();
  });

  it("should be defined", () => {
    expect(module).toBeDefined();
  });

  it("should provide UploadController", () => {
    const controller = module.get<UploadController>(UploadController);
    expect(controller).toBeDefined();
  });
});
