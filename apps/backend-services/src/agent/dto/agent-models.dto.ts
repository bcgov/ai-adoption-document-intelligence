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

  @ApiProperty({
    description:
      "Long, unambiguous display label — provider and model. Used as the picker's accessible name.",
    example: "Azure OpenAI — gpt-4o",
  })
  label!: string;

  @ApiProperty({
    description:
      "Short display name for the composer's inline picker trigger. Derived from the model family where the id names one; otherwise the model id verbatim.",
    example: "Haiku 4.5",
  })
  name!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "One-line descriptor of the model's family — 'Fast', 'Balanced', 'Deep reasoning'. Null when the id names no family this backend recognises (the normal case for a privately-named Azure deployment); no tier is invented.",
    example: "Balanced",
  })
  tier!: string | null;

  @ApiProperty({
    description:
      "True for the single entry the backend uses when a chat turn names no provider/model.",
  })
  isDefault!: boolean;
}

/** One provider that is NOT configured, and what would configure it. */
export class AgentProviderRequirementDto {
  @ApiProperty({
    enum: [...AGENT_PROVIDERS],
    description: "The provider these variables would enable.",
  })
  provider!: AgentProvider;

  @ApiProperty({
    type: [String],
    description:
      "Environment variable NAMES this provider needs, all of them required together. Never a value.",
    example: ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"],
  })
  variables!: string[];
}

/** `GET /api/agent/models` response. */
export class AgentModelsResponseDto {
  @ApiProperty({
    type: [AgentModelOptionDto],
    description:
      "Models this backend is configured for. A provider contributes at most one entry, because its configuration names exactly one model. An empty array means no provider has credentials here — the assistant cannot answer, and `missingConfig` says what would fix that.",
  })
  items!: AgentModelOptionDto[];

  @ApiProperty({
    type: [AgentProviderRequirementDto],
    description:
      "Providers this backend is not configured for, with the variable NAMES each needs. Empty when every supported provider is configured. Values are never included.",
  })
  missingConfig!: AgentProviderRequirementDto[];
}
