import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ApiAcceptedResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { Identity } from "@/auth/identity.decorator";
import {
  getIdentityGroupIds,
  identityCanAccessGroup,
} from "@/auth/identity.helpers";
import { DocumentService } from "@/document/document.service";
import { ReprocessDocumentResponseDto } from "@/document/dto/reprocess-document-response.dto";
import { TrainingService } from "@/training/training.service";
import { OcrService } from "./ocr.service";

@ApiTags("OCR")
@Controller("api")
export class OcrController {
  private readonly allowedModels: string[];

  constructor(
    private configService: ConfigService,
    private trainingService: TrainingService,
    private readonly documentService: DocumentService,
    private readonly ocrService: OcrService,
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

  @Post("documents/:documentId/reprocess")
  @HttpCode(HttpStatus.ACCEPTED)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Re-run a document's workflow",
    description:
      "Starts the document's workflow again from the beginning using its existing normalized PDF. Allowed only for documents that are `failed` or stuck in `ongoing_ocr`; the run is rejected (409) for any other state, a missing/purged source file, an in-flight run, or a missing workflow configuration.",
  })
  @ApiParam({ name: "documentId", description: "Document ID" })
  @ApiAcceptedResponse({
    description: "Re-run started",
    type: ReprocessDocumentResponseDto,
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  @ApiNotFoundResponse({ description: "Document not found" })
  @ApiConflictResponse({
    description:
      "Document is not in a re-runnable state, has no available source file, is already processing, or has no workflow configuration",
  })
  async reprocessDocument(
    @Param("documentId") documentId: string,
    @Req() req: Request,
  ): Promise<ReprocessDocumentResponseDto> {
    const document = await this.documentService.findDocument(documentId);
    if (!document) {
      throw new NotFoundException(`Document not found: ${documentId}`);
    }

    identityCanAccessGroup(req.resolvedIdentity, document.group_id);

    const { workflowExecutionId, status } =
      await this.ocrService.reprocessDocument(document);

    return { success: true, workflowExecutionId, status };
  }
}
