import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { AppModule } from "./app.module";
import { AuthModule } from "./auth/auth.module";
import { DatabaseModule } from "./database/database.module";
import { DocumentModule } from "./document/document.module";
import { OcrModule } from "./ocr/ocr.module";
import { QueueModule } from "./queue/queue.module";
import { UploadModule } from "./upload/upload.module";

describe("AppModule", () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  it("should be defined", () => {
    expect(module).toBeDefined();
  });

  it("should import ConfigModule", () => {
    const configModule = module.get(ConfigModule);
    expect(configModule).toBeDefined();
  });

  it("should import all feature modules", () => {
    // Check that all modules are imported by verifying we can get them
    expect(() => module.get(AuthModule)).not.toThrow();
    expect(() => module.get(DatabaseModule)).not.toThrow();
    expect(() => module.get(DocumentModule)).not.toThrow();
    expect(() => module.get(QueueModule)).not.toThrow();
    expect(() => module.get(UploadModule)).not.toThrow();
    expect(() => module.get(OcrModule)).not.toThrow();
  });
});
