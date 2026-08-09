import { ApiProperty } from "@nestjs/swagger";
import type { AgentProvider } from "../agent.env";
import { AGENT_PROVIDERS } from "./agent-chat-request.dto";

/** One model the backend can serve, as shown in the chat drawer's picker. */
export class AgentModelOptionDto {
  @ApiProperty({
    enum: [...AGENT_PROVIDERS],
    description: "The provider SDK this model is served through.",
  })
  provider!: AgentProvider;

  @ApiProperty({
    description:
      "The value to send back as `model` on a chat turn. For Azure this is the deployment name, not a global model identifier.",
  })
  model!: string;

  @ApiProperty({ description: "Display label for the model picker." })
  label!: string;

  @ApiProperty({
    description:
      "True for the single entry the backend uses when a chat turn names no provider/model.",
  })
  isDefault!: boolean;
}

/** `GET /api/agent/models` response. */
export class AgentModelsResponseDto {
  @ApiProperty({
    type: [AgentModelOptionDto],
    description:
      "Models this backend is configured for. A provider contributes at most one entry, because its configuration names exactly one model. Empty is not possible in a running backend — `AgentModule` refuses to start with no provider configured.",
  })
  items!: AgentModelOptionDto[];
}
