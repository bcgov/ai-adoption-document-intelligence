import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import {
  ApiKeyAuth,
  KeycloakSSOAuth,
} from "@/decorators/custom-auth-decorators";
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

interface AuthenticatedRequest {
  user?: {
    sub?: string;
    id?: string;
  };
}

@ApiTags("hitl")
@Controller("api/hitl")
export class HitlController {
  constructor(private readonly hitlService: HitlService) {}

  @Get("queue")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get review queue with filters" })
  @ApiOkResponse({
    description: "Paginated list of documents requiring human review",
    type: QueueResponseDto,
  })
  async getQueue(@Query() filters: QueueFilterDto) {
    return this.hitlService.getQueue(filters);
  }

  @Get("queue/stats")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get queue statistics" })
  @ApiQuery({
    name: "reviewStatus",
    required: false,
    enum: ReviewStatusFilter,
    enumName: "ReviewStatusFilter",
    description: "Filter by review status",
  })
  @ApiOkResponse({
    description:
      "Queue statistics including total counts and average confidence",
    type: QueueStatsResponseDto,
  })
  async getQueueStats(
    @Query("reviewStatus") reviewStatus?: ReviewStatusFilter,
  ) {
    return this.hitlService.getQueueStats(reviewStatus);
  }

  @Post("sessions")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Start a review session" })
  @ApiCreatedResponse({
    description: "Review session created with document and OCR data",
    type: ReviewSessionResponseDto,
  })
  async startSession(
    @Body() dto: ReviewSessionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const reviewerId = req.user?.sub || req.user?.id || "anonymous";
    return this.hitlService.startSession(dto, reviewerId);
  }

  @Get("sessions/:id")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get review session details" })
  @ApiParam({ name: "id", description: "Session ID" })
  @ApiOkResponse({
    description: "Review session with document, OCR data, and corrections",
    type: ReviewSessionResponseDto,
  })
  async getSession(@Param("id") id: string) {
    return this.hitlService.getSession(id);
  }

  @Post("sessions/:id/corrections")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Submit corrections for a session" })
  @ApiParam({ name: "id", description: "Session ID" })
  @ApiCreatedResponse({
    description: "Corrections saved successfully",
    type: SubmitCorrectionsResponseDto,
  })
  async submitCorrections(
    @Param("id") sessionId: string,
    @Body() dto: SubmitCorrectionsDto,
  ) {
    return this.hitlService.submitCorrections(sessionId, dto);
  }

  @Get("sessions/:id/corrections")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get correction history for a session" })
  @ApiParam({ name: "id", description: "Session ID" })
  @ApiOkResponse({
    description: "List of all corrections submitted for the session",
    type: CorrectionsListResponseDto,
  })
  async getCorrections(@Param("id") sessionId: string) {
    return this.hitlService.getCorrections(sessionId);
  }

  @Post("sessions/:id/submit")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Approve and complete a review session" })
  @ApiParam({ name: "id", description: "Session ID" })
  @ApiOkResponse({
    description: "Session approved and marked complete",
    type: SessionActionResponseDto,
  })
  async approveSession(@Param("id") sessionId: string) {
    return this.hitlService.approveSession(sessionId);
  }

  @Post("sessions/:id/escalate")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Escalate a document for expert review" })
  @ApiParam({ name: "id", description: "Session ID" })
  @ApiOkResponse({
    description: "Session escalated for expert review",
    type: SessionActionResponseDto,
  })
  async escalateSession(
    @Param("id") sessionId: string,
    @Body() dto: EscalateDto,
  ) {
    return this.hitlService.escalateSession(sessionId, dto);
  }

  @Post("sessions/:id/skip")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Skip a review session" })
  @ApiParam({ name: "id", description: "Session ID" })
  @ApiOkResponse({
    description: "Session skipped",
    type: SessionActionResponseDto,
  })
  async skipSession(@Param("id") sessionId: string) {
    return this.hitlService.skipSession(sessionId);
  }

  @Get("analytics")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get HITL analytics" })
  @ApiOkResponse({
    description:
      "Review analytics including correction rates and session summaries",
    type: AnalyticsResponseDto,
  })
  async getAnalytics(@Query() filters: AnalyticsFilterDto) {
    return this.hitlService.getAnalytics(filters);
  }
}
