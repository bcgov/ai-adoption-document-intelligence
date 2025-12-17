import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { DatabaseModule } from "@/database/database.module";
import { OcrModule } from "./ocr.module";
import { OcrService } from "./ocr.service";

describe("OcrModule", () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          envFilePath: ".env",
          isGlobal: true,
        }),
        OcrModule,
        DatabaseModule,
        HttpModule,
      ],
    }).compile();
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
