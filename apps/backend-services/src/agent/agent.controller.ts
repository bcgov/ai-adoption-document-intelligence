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
  /** Active group ID — required for system-admin callers; otherwise inferred from membership. */
  groupId?: string | null;
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

  // Pull an explicit groupId hint from the request body (POST), query
  // (`?groupId=`), or `x-group-id` header. Required for system-admin
  // callers; tie-breaker for non-admin users in multiple groups.
  const bodyMap =
    req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>)
      : {};
  const headerGroup =
    typeof req.headers["x-group-id"] === "string"
      ? (req.headers["x-group-id"] as string)
      : null;
  const queryGroup =
    typeof req.query["groupId"] === "string"
      ? (req.query["groupId"] as string)
      : null;
  const bodyGroup =
    typeof bodyMap["groupId"] === "string"
      ? (bodyMap["groupId"] as string)
      : null;
  const requestedGroup = bodyGroup ?? queryGroup ?? headerGroup ?? null;

  const groupIds = getIdentityGroupIds(identity);

  // System-admin path: groupIds === undefined. They MUST pass a groupId
  // explicitly (system-admin sees all groups but must choose one for
  // any per-group write).
  if (groupIds === undefined) {
    if (requestedGroup === null) {
      throw new UnauthorizedException(
        "System-admin callers must include a `groupId` in the request body, query (`?groupId=...`), or `x-group-id` header.",
      );
    }
    return {
      actorId,
      groupId: requestedGroup,
      apiKey: extractApiKey(req),
    };
  }

  // Non-admin path: must be a member of at least one group. Prefer the
  // requested group if they're a member; otherwise fall back to their
  // sole group (when there's exactly one).
  if (groupIds.length === 0) {
    throw new UnauthorizedException("Caller has no group membership.");
  }
  if (requestedGroup !== null) {
    if (!groupIds.includes(requestedGroup)) {
      throw new UnauthorizedException(
        `Caller is not a member of group '${requestedGroup}'.`,
      );
    }
    return { actorId, groupId: requestedGroup, apiKey: extractApiKey(req) };
  }
  if (groupIds.length !== 1) {
    throw new UnauthorizedException(
      "Caller belongs to multiple groups — include `groupId` in the request to disambiguate.",
    );
  }
  return { actorId, groupId: groupIds[0], apiKey: extractApiKey(req) };
}

function extractApiKey(req: Request): string | null {
  return typeof req.headers["x-api-key"] === "string"
    ? (req.headers["x-api-key"] as string)
    : null;
}
