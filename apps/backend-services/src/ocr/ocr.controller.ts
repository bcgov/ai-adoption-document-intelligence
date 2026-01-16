import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

@ApiTags("OCR")
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
  @ApiOperation({ summary: "Get a list of available OCR models" })
  @KeycloakSSOAuth()
  @ApiOkResponse({schema: {default: { models: ["string"]}}})
  getModels(): { models: string[] } {
    return { models: this.allowedModels };
  }
}
