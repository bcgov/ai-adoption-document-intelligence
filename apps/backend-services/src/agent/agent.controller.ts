import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { UIMessage } from "ai";
import type { Request, Response } from "express";
import { Identity } from "@/auth/identity.decorator";
import { getIdentityGroupIds } from "@/auth/identity.helpers";
import { AbortFlagMap } from "./abort-flag-map";
import type { AgentProvider } from "./agent.env";
import { AgentService } from "./agent.service";

interface AgentChatRequestBody {
  conversationId?: string | null;
  workflowId?: string | null;
  provider?: AgentProvider;
  model?: string;
  /** UI messages forwarded from assistant-ui's composer. */
  messages: UIMessage[];
}

@ApiTags("agent")
@Controller("api/agent")
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly abortFlags: AbortFlagMap,
    private readonly config: ConfigService,
  ) {}

  @Post("chat")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary:
      "Stream a Phase 7 agent chat turn. Returns a Vercel AI SDK UI message stream consumed by assistant-ui's runtime adapter.",
  })
  async chat(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: AgentChatRequestBody,
  ): Promise<void> {
    const { actorId, groupId, apiKey } = resolveCallerOrThrow(req);
    const backendBaseUrl =
      this.config.get<string>("BACKEND_INTERNAL_URL") ??
      `http://localhost:${process.env.PORT ?? "3002"}`;

    const result = await this.agentService.startChat({
      conversationId: body.conversationId ?? null,
      workflowId: body.workflowId ?? null,
      groupId,
      actorId,
      apiKey,
      backendBaseUrl,
      provider: body.provider,
      model: body.model,
      messages: body.messages ?? [],
    });

    res.setHeader("x-conversation-id", result.conversationId);
    result.streamResult.pipeUIMessageStreamToResponse(res, {
      sendReasoning: false,
    });
  }

  @Get("conversations")
  @Identity({ allowApiKey: true })
  async listConversations(
    @Req() req: Request,
    @Query("workflowId") workflowId?: string,
  ) {
    const { actorId, groupId } = resolveCallerOrThrow(req);
    const items = await this.agentService.listConversationsForCaller({
      actorId,
      groupId,
      workflowId: workflowId ?? undefined,
    });
    return { items };
  }

  @Get("conversations/:id")
  @Identity({ allowApiKey: true })
  async getConversation(@Req() req: Request, @Param("id") id: string) {
    const { actorId } = resolveCallerOrThrow(req);
    return this.agentService.getConversationForCaller(id, actorId);
  }

  @Delete("conversations/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Identity({ allowApiKey: true })
  async deleteConversation(@Req() req: Request, @Param("id") id: string) {
    const { actorId } = resolveCallerOrThrow(req);
    await this.agentService.deleteConversationForCaller(id, actorId);
  }

  @Post("conversations/:id/abort")
  @Identity({ allowApiKey: true })
  async abortConversation(@Req() req: Request, @Param("id") id: string) {
    const { actorId } = resolveCallerOrThrow(req);
    // Verify ownership (throws 404 on cross-user access).
    await this.agentService.getConversationForCaller(id, actorId);
    const aborted = this.abortFlags.abort(id);
    return { ok: true, aborted };
  }
}

interface ResolvedCaller {
  actorId: string;
  groupId: string;
  apiKey: string | null;
}

function resolveCallerOrThrow(req: Request): ResolvedCaller {
  const identity = req.resolvedIdentity;
  if (!identity) {
    throw new UnauthorizedException("Authentication required");
  }
  const actorId = identity.actorId;
  if (!actorId) {
    throw new UnauthorizedException("Caller has no resolved actor");
  }
  const groupIds = getIdentityGroupIds(identity);
  if (!groupIds || groupIds.length !== 1) {
    throw new UnauthorizedException(
      "Caller must belong to exactly one group for Phase 7 chat",
    );
  }
  const apiKey =
    typeof req.headers["x-api-key"] === "string"
      ? (req.headers["x-api-key"] as string)
      : null;
  return { actorId, groupId: groupIds[0], apiKey };
}
