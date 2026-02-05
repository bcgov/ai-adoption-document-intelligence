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
import { ApiOperation, ApiTags, ApiParam } from "@nestjs/swagger";
import {
  ApiKeyAuth,
  KeycloakSSOAuth,
} from "@/decorators/custom-auth-decorators";
import {
  SubmitCorrectionsDto,
  EscalateDto,
} from "./dto/correction.dto";
import { QueueFilterDto, ReviewStatusFilter, AnalyticsFilterDto } from "./dto/queue-filter.dto";
import { ReviewSessionDto } from "./dto/review-session.dto";
import { HitlService } from "./hitl.service";

@ApiTags("hitl")
@Controller("api/hitl")
export class HitlController {
  constructor(private readonly hitlService: HitlService) {}

  @Get("queue")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get review queue with filters" })
  async getQueue(@Query() filters: QueueFilterDto) {
    return this.hitlService.getQueue(filters);
  }

  @Get("queue/stats")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get queue statistics" })
  async getQueueStats(@Query('reviewStatus') reviewStatus?: ReviewStatusFilter) {
    return this.hitlService.getQueueStats(reviewStatus);
  }

  @Post("sessions")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Start a review session" })
  async startSession(@Body() dto: ReviewSessionDto, @Req() req: any) {
    // Extract user ID from request (set by auth guard)
    const reviewerId = req.user?.sub || req.user?.id || "anonymous";
    return this.hitlService.startSession(dto, reviewerId);
  }

  @Get("sessions/:id")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get review session details" })
  @ApiParam({ name: "id", description: "Session ID" })
  async getSession(@Param("id") id: string) {
    return this.hitlService.getSession(id);
  }

  @Post("sessions/:id/corrections")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Submit corrections for a session" })
  @ApiParam({ name: "id", description: "Session ID" })
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
  async getCorrections(@Param("id") sessionId: string) {
    return this.hitlService.getCorrections(sessionId);
  }

  @Post("sessions/:id/submit")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Approve and complete a review session" })
  @ApiParam({ name: "id", description: "Session ID" })
  async approveSession(@Param("id") sessionId: string) {
    return this.hitlService.approveSession(sessionId);
  }

  @Post("sessions/:id/escalate")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Escalate a document for expert review" })
  @ApiParam({ name: "id", description: "Session ID" })
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
  async skipSession(@Param("id") sessionId: string) {
    return this.hitlService.skipSession(sessionId);
  }

  @Get("analytics")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get HITL analytics" })
  async getAnalytics(@Query() filters: AnalyticsFilterDto) {
    return this.hitlService.getAnalytics(filters);
  }
}
