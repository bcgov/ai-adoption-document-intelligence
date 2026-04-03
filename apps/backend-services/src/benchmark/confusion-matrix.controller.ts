/**
 * HTTP API for character-level confusion matrices derived from HITL corrections.
 *
 * See docs-md/OCR_CONFUSION_MATRICES.md
 */

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import {
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { Identity } from "@/auth/identity.decorator";
import { identityCanAccessGroup } from "@/auth/identity.helpers";
import { BenchmarkProjectService } from "./benchmark-project.service";
import type { ConfusionMatrixResult } from "./confusion-matrix.service";
import { ConfusionMatrixService } from "./confusion-matrix.service";
import { ConfusionMatrixDeriveDto } from "./dto";

@ApiTags("Benchmark - Confusion matrix")
@Controller("api/benchmark/projects/:projectId")
export class ConfusionMatrixController {
  private readonly logger = new Logger(ConfusionMatrixController.name);

  constructor(
    private readonly confusionMatrixService: ConfusionMatrixService,
    private readonly benchmarkProjectService: BenchmarkProjectService,
  ) {}

  @Post("confusion-matrix/derive")
  @HttpCode(HttpStatus.OK)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Derive character confusion matrix from HITL corrections",
    description:
      "Computes a character-level confusion matrix from FieldCorrection rows (corrected action). " +
      "If groupIds is omitted, defaults to the benchmark project’s group.",
  })
  @ApiParam({ name: "projectId", description: "Benchmark project ID" })
  @ApiBody({ type: ConfusionMatrixDeriveDto })
  @ApiOkResponse({
    description: "Confusion matrix JSON (schemaVersion 1.0)",
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async derive(
    @Param("projectId") projectId: string,
    @Body() dto: ConfusionMatrixDeriveDto,
    @Req() req: Request,
  ): Promise<ConfusionMatrixResult> {
    this.logger.log(
      `POST /api/benchmark/projects/${projectId}/confusion-matrix/derive`,
    );
    const project =
      await this.benchmarkProjectService.getProjectById(projectId);
    identityCanAccessGroup(req.resolvedIdentity, project.groupId);

    const groupIds =
      dto.groupIds && dto.groupIds.length > 0
        ? dto.groupIds
        : [project.groupId];

    return this.confusionMatrixService.deriveFromHitlCorrections({
      startDate: dto.startDate,
      endDate: dto.endDate,
      groupIds,
      fieldKeys: dto.fieldKeys,
    });
  }
}
