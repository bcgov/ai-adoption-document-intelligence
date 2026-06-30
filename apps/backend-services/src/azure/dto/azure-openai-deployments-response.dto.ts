import { ApiProperty } from "@nestjs/swagger";

export class AzureOpenAiDeploymentsResponseDto {
  @ApiProperty({
    description:
      "Azure OpenAI deployment names allowed for selection on workflow nodes (e.g. for the enrichResults activity's azureOpenAiDeployment parameter). Parsed from the AZURE_OPENAI_DEPLOYMENTS env var (comma-separated). The first entry is treated as the default if a workflow node doesn't specify one.",
    example: ["gpt-4o", "gpt-5"],
    type: [String],
  })
  deployments!: string[];
}
