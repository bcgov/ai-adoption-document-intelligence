import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import type { AgentProvider } from "../agent.env";

/** Providers accepted on a chat turn — mirrors {@link AgentProvider}. */
export const AGENT_PROVIDERS: readonly AgentProvider[] = ["anthropic", "azure"];

/** Upper bound on a single chat turn's forwarded message history. */
export const MAX_CHAT_MESSAGES = 200;

/**
 * Request body for `POST /api/agent/chat`. Replaces the previously untyped
 * interface so the global `ValidationPipe` (whitelist + forbidNonWhitelisted)
 * actually validates the inbound shape and bounds its size.
 */
export class AgentChatRequestDto {
  @ApiPropertyOptional({
    description:
      "Existing conversation to continue. Omit or null to start a new conversation.",
    nullable: true,
  })
  @IsOptional()
  @IsString()
  conversationId?: string | null;

  @ApiPropertyOptional({
    description: "Workflow this conversation is scoped to, if any.",
    nullable: true,
  })
  @IsOptional()
  @IsString()
  workflowId?: string | null;

  @ApiPropertyOptional({
    description:
      "Active group ID. Required for system-admin callers; otherwise inferred from membership.",
    nullable: true,
  })
  @IsOptional()
  @IsString()
  groupId?: string | null;

  @ApiPropertyOptional({
    description:
      "LLM provider for this turn. Defaults to the server's configured provider.",
    enum: AGENT_PROVIDERS,
  })
  @IsOptional()
  @IsIn(AGENT_PROVIDERS)
  provider?: AgentProvider;

  @ApiPropertyOptional({
    description:
      "Provider model / deployment override. Defaults to the provider's configured model.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;

  @ApiProperty({
    description:
      "UI messages forwarded from the assistant-ui composer (Vercel AI SDK `UIMessage[]`). Validated as a bounded array of objects; per-message content shape is owned by the AI SDK.",
    type: "array",
    items: { type: "object", additionalProperties: true },
    maxItems: MAX_CHAT_MESSAGES,
  })
  @IsArray()
  @ArrayMaxSize(MAX_CHAT_MESSAGES)
  @IsObject({ each: true })
  messages!: Record<string, unknown>[];
}
