import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { DatabaseService } from "@/database/database.service";
import { KeycloakSSOAuth } from "@/decorators/custom-auth-decorators";

@ApiTags("OCR")
@Controller("api")
export class OcrController {
  private readonly allowedModels: string[];

  constructor(
    private configService: ConfigService,
    private db: DatabaseService,
  ) {
    const modelsEnv = this.configService.get<string>(
      "AZURE_DOC_INTELLIGENCE_MODELS",
    );
    this.allowedModels = modelsEnv
      ? modelsEnv.split(",").map((m) => m.trim())
      : ["prebuilt-layout"];
  }

  @Get("models")
  @ApiOperation({
    summary: "Get a list of available OCR models (prebuilt + trained)",
  })
  @KeycloakSSOAuth()
  @ApiOkResponse({ schema: { default: { models: ["string"] } } })
  async getModels(): Promise<{ models: string[] }> {
    const prisma = this.db["prisma"];
    const trained =
      prisma &&
      (await prisma.trainedModel.findMany({
        select: { model_id: true },
        distinct: ["model_id"],
        orderBy: { model_id: "asc" },
      }));
    const trainedIds = trained ? trained.map((m) => m.model_id) : [];
    const prebuiltSet = new Set(this.allowedModels);
    const combined = [
      ...this.allowedModels,
      ...trainedIds.filter((id) => !prebuiltSet.has(id)),
    ];
    return { models: combined };
  }
}
