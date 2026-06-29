import { Controller, Get, Req } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { Identity } from "@/auth/identity.decorator";
import { getIdentityGroupIds } from "@/auth/identity.helpers";
import { TrainingService } from "@/training/training.service";

@ApiTags("OCR")
@Controller("api")
export class OcrController {
  private readonly allowedModels: string[];

  constructor(
    private configService: ConfigService,
    private trainingService: TrainingService,
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
  async getModels(@Req() req: Request): Promise<{ models: string[] }> {
    // Scope trained models to the caller's groups so a member of one group
    // cannot enumerate another group's trained model IDs. Prebuilt models are
    // not group-owned and are always available.
    const groupIds = getIdentityGroupIds(req.resolvedIdentity);
    const trainedModelIds =
      await this.trainingService.findAllTrainedModelIds(groupIds);
    // Pull model_ids into one set for deduplication
    const combined = new Set([...this.allowedModels, ...trainedModelIds]);
    // Return sorted result if order matters
    return { models: Array.from(combined).sort() };
  }
}
