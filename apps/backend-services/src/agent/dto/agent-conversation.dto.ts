import { ApiProperty } from "@nestjs/swagger";

/**
 * Response shape for a chat conversation row. Mirrors `ChatConversationRow`
 * from the repository (the persisted subset returned to the client).
 */
export class ChatConversationDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  workflowId!: string | null;

  @ApiProperty()
  groupId!: string;

  @ApiProperty()
  createdBy!: string;

  @ApiProperty()
  provider!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty({ type: String, nullable: true })
  title!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: Date;

  @ApiProperty({ type: String, format: "date-time" })
  lastMessageAt!: Date;
}

/** Response shape for a single persisted chat message. */
export class ChatMessageDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  conversationId!: string;

  @ApiProperty()
  role!: string;

  @ApiProperty({
    description: "Persisted message content (AI SDK message parts).",
    type: "object",
    additionalProperties: true,
    nullable: true,
  })
  content!: unknown;

  @ApiProperty({ type: Number, nullable: true })
  inputTokens!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  outputTokens!: number | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: Date;
}

/** `GET /api/agent/conversations` response. */
export class ConversationListResponseDto {
  @ApiProperty({ type: [ChatConversationDto] })
  items!: ChatConversationDto[];
}

/** `GET /api/agent/conversations/:id` response. */
export class ConversationDetailResponseDto {
  @ApiProperty({ type: ChatConversationDto })
  conversation!: ChatConversationDto;

  @ApiProperty({ type: [ChatMessageDto] })
  messages!: ChatMessageDto[];
}

/** `POST /api/agent/conversations/:id/abort` response. */
export class AbortConversationResponseDto {
  @ApiProperty({
    description: "Always true when the abort request was accepted.",
  })
  ok!: boolean;

  @ApiProperty({
    description:
      "True if an in-flight stream for this conversation was found and signalled to abort.",
  })
  aborted!: boolean;
}
