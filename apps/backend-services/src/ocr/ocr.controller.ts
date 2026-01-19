import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Controller("api")
export class OcrController {
  private readonly allowedModels: string[];

  constructor(private configService: ConfigService) {
    const modelsEnv = this.configService.get<string>(
      "AZURE_DOC_INTELLIGENCE_MODELS",
    );
    this.allowedModels = modelsEnv
      ? modelsEnv.split(",").map((m) => m.trim())
      : ["prebuilt-layout"];
  }

  @Get("models")
  getModels(): { models: string[] } {
    return { models: this.allowedModels };
  }
}
