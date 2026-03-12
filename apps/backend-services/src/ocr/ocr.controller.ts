import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { DatabaseService } from "@/database/database.service";
import { Identity } from "@/auth/identity.decorator";

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
  @Identity({ allowApiKey: true })
  @ApiOkResponse({ schema: { default: { models: ["string"] } } })
  async getModels(): Promise<{ models: string[] }> {
    const prisma = this.db["prisma"];
    const trained = prisma
      ? await prisma.trainedModel.findMany({
          select: { model_id: true },
          distinct: ["model_id"],
        })
      : [];
    // Pull model_ids into one set for deduplication
    const combined = new Set([
      ...this.allowedModels,
      ...trained.map((m) => m.model_id),
    ]);
    // Return sorted result if order matters
    return { models: Array.from(combined).sort() };
  }
}
