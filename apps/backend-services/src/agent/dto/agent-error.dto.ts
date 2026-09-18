import { ApiProperty } from "@nestjs/swagger";
import type { AgentErrorCode } from "../agent-errors";

/**
 * The body a deliberate agent refusal returns. Documented as a DTO because
 * the browser reads `code` to name the cause in the conversation instead of
 * showing a generic failure (item 22).
 */
export class AgentErrorResponseDto {
  @ApiProperty({ description: "HTTP status code, repeated in the body." })
  statusCode!: number;

  @ApiProperty({
    description: "Machine-readable cause.",
    enum: [
      "provider-not-configured",
      "assistant-not-configured",
      "unknown-model",
      "conversation-budget-exceeded",
      "demo-conversation-read-only",
    ],
  })
  code!: AgentErrorCode;

  @ApiProperty({ description: "Human-readable explanation of the refusal." })
  message!: string;

  @ApiProperty({
    required: false,
    description: "The provider the request asked for, when relevant.",
  })
  provider?: string;

  @ApiProperty({
    required: false,
    type: [String],
    description:
      "Environment variable NAMES an operator must set. Never contains values.",
  })
  missingConfig?: string[];
}
