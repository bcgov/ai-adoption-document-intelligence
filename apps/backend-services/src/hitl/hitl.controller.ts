import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { Identity } from "@/auth/identity.decorator";
import {
  getIdentityGroupIds,
  identityCanAccessGroup,
} from "@/auth/identity.helpers";
import { DocumentService } from "../document/document.service";
import { EscalateDto, SubmitCorrectionsDto } from "./dto/correction.dto";
import {
  AnalyticsResponseDto,
  CorrectionsListResponseDto,
  QueueResponseDto,
  QueueStatsResponseDto,
  ReviewSessionResponseDto,
  SessionActionResponseDto,
  SubmitCorrectionsResponseDto,
} from "./dto/hitl-responses.dto";
import { AnalyticsFilterDto, QueueFilterDto } from "./dto/queue-filter.dto";
import { ReviewSessionDto } from "./dto/review-session.dto";
import { ReviewStatusFilter } from "./dto/status-constants.dto";
import { HitlService } from "./hitl.service";

@ApiTags("hitl")
@Controller("api/hitl")
export class HitlController {
  constructor(
    private readonly hitlService: HitlService,
    private readonly documentService: DocumentService,
  ) {}

  @Get("queue")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get review queue with filters" })
  @ApiOkResponse({
    description: "Paginated list of documents requiring human review",
    type: QueueResponseDto,
  })
  async getQueue(@Query() filters: QueueFilterDto, @Req() req: Request) {
    let groupIds: string[];
    if (filters.group_id) {
      identityCanAccessGroup(req.resolvedIdentity, filters.group_id);
      groupIds = [filters.group_id];
    } else {
      groupIds = getIdentityGroupIds(req.resolvedIdentity);
    }
    return this.hitlService.getQueue(filters, groupIds);
  }

  @Get("queue/stats")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get queue statistics" })
  @ApiQuery({
    name: "reviewStatus",
    required: false,
    enum: ReviewStatusFilter,
    enumName: "ReviewStatusFilter",
    description: "Filter by review status",
  })
  @ApiQuery({
    name: "group_id",
    required: false,
    type: String,
    description: "Scope stats to a specific group ID",
  })
  @ApiOkResponse({
    description:
      "Queue statistics including total counts and average confidence",
    type: QueueStatsResponseDto,
  })
  async getQueueStats(
    @Query("reviewStatus") reviewStatus?: ReviewStatusFilter,
    @Req() req?: Request,
    @Query("group_id") group_id?: string,
  ) {
    let groupIds: string[];
    if (group_id) {
      identityCanAccessGroup(req?.resolvedIdentity, group_id);
      groupIds = [group_id];
    } else {
      groupIds = getIdentityGroupIds(req?.resolvedIdentity);
    }
    return this.hitlService.getQueueStats(reviewStatus, groupIds);
  }

  @Post("sessions")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Start a review session" })
  @ApiCreatedResponse({
    description: "Review session created with document and OCR data",
    type: ReviewSessionResponseDto,
  })
  @ApiNotFoundResponse({ description: "Document not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async startSession(@Body() dto: ReviewSessionDto, @Req() req: Request) {
    const document = await this.documentService.findDocument(dto.documentId);
    if (!document) {
      throw new NotFoundException(`Document ${dto.documentId} not found`);
    }
    identityCanAccessGroup(req.resolvedIdentity, document.group_id);
    const reviewerId =
      req.user?.sub || (req.user as { id?: string })?.id || "anonymous";
    return this.hitlService.startSession(dto, reviewerId);
  }

  @Get("sessions/:id")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get review session details" })
  @ApiParam({ name: "id", description: "Session ID" })
  @ApiOkResponse({
    description: "Review session with document, OCR data, and corrections",
    type: ReviewSessionResponseDto,
  })
  @ApiNotFoundResponse({ description: "Session not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getSession(@Param("id") id: string, @Req() req: Request) {
    const session = await this.hitlService.findReviewSession(id);
    if (!session) {
      throw new NotFoundException(`Review session ${id} not found`);
    }
    identityCanAccessGroup(req.resolvedIdentity, session.document.group_id);
    return this.hitlService.getSession(id);
  }

  @Post("sessions/:id/corrections")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Submit corrections for a session" })
  @ApiParam({ name: "id", description: "Session ID" })
  @ApiCreatedResponse({
    description: "Corrections saved successfully",
    type: SubmitCorrectionsResponseDto,
  })
  @ApiNotFoundResponse({ description: "Session not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async submitCorrections(
    @Param("id") sessionId: string,
    @Body() dto: SubmitCorrectionsDto,
    @Req() req: Request,
  ) {
    const session = await this.hitlService.findReviewSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }
    identityCanAccessGroup(req.resolvedIdentity, session.document.group_id);
    return this.hitlService.submitCorrections(sessionId, dto);
  }

  @Get("sessions/:id/corrections")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get correction history for a session" })
  @ApiParam({ name: "id", description: "Session ID" })
  @ApiOkResponse({
    description: "List of all corrections submitted for the session",
    type: CorrectionsListResponseDto,
  })
  @ApiNotFoundResponse({ description: "Session not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getCorrections(@Param("id") sessionId: string, @Req() req: Request) {
    const session = await this.hitlService.findReviewSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }
    identityCanAccessGroup(req.resolvedIdentity, session.document.group_id);
    return this.hitlService.getCorrections(sessionId);
  }

  @Post("sessions/:id/submit")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Approve and complete a review session" })
  @ApiParam({ name: "id", description: "Session ID" })
  @ApiOkResponse({
    description: "Session approved and marked complete",
    type: SessionActionResponseDto,
  })
  @ApiNotFoundResponse({ description: "Session not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async approveSession(@Param("id") sessionId: string, @Req() req: Request) {
    const session = await this.hitlService.findReviewSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }
    identityCanAccessGroup(req.resolvedIdentity, session.document.group_id);
    return this.hitlService.approveSession(sessionId);
  }

  @Post("sessions/:id/escalate")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Escalate a document for expert review" })
  @ApiParam({ name: "id", description: "Session ID" })
  @ApiOkResponse({
    description: "Session escalated for expert review",
    type: SessionActionResponseDto,
  })
  @ApiNotFoundResponse({ description: "Session not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async escalateSession(
    @Param("id") sessionId: string,
    @Body() dto: EscalateDto,
    @Req() req: Request,
  ) {
    const session = await this.hitlService.findReviewSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }
    identityCanAccessGroup(req.resolvedIdentity, session.document.group_id);
    return this.hitlService.escalateSession(sessionId, dto);
  }

  @Post("sessions/:id/skip")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Skip a review session" })
  @ApiParam({ name: "id", description: "Session ID" })
  @ApiOkResponse({
    description: "Session skipped",
    type: SessionActionResponseDto,
  })
  @ApiNotFoundResponse({ description: "Session not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async skipSession(@Param("id") sessionId: string, @Req() req: Request) {
    const session = await this.hitlService.findReviewSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }
    identityCanAccessGroup(req.resolvedIdentity, session.document.group_id);
    return this.hitlService.skipSession(sessionId);
  }

  @Get("analytics")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get HITL analytics" })
  @ApiOkResponse({
    description:
      "Review analytics including correction rates and session summaries",
    type: AnalyticsResponseDto,
  })
  async getAnalytics(
    @Query() filters: AnalyticsFilterDto,
    @Req() req: Request,
  ) {
    let groupIds: string[];
    if (filters.group_id) {
      identityCanAccessGroup(req.resolvedIdentity, filters.group_id);
      groupIds = [filters.group_id];
    } else {
      groupIds = getIdentityGroupIds(req.resolvedIdentity);
    }
    return this.hitlService.getAnalytics(filters, groupIds);
  }
}
