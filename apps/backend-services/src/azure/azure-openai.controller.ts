import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Identity } from "@/auth/identity.decorator";
import { AzureOpenAiDeploymentsResponseDto } from "@/azure/dto/azure-openai-deployments-response.dto";

/**
 * Lists Azure OpenAI deployments the workflow editor / activity nodes may select.
 *
 * Allow-list is sourced from AZURE_OPENAI_DEPLOYMENTS (comma-separated). When unset
 * the controller falls back to the single deployment name in AZURE_OPENAI_DEPLOYMENT
 * for backward compatibility, or an empty array if neither is set.
 */
@ApiTags("Azure OpenAI")
@Controller("api/azure-openai")
export class AzureOpenAiController {
  constructor(private readonly configService: ConfigService) {}

  @Get("deployments")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary:
      "List Azure OpenAI deployments allowed for workflow node selection",
  })
  @ApiOkResponse({
    description: "Allowed deployment names",
    type: AzureOpenAiDeploymentsResponseDto,
  })
  @ApiUnauthorizedResponse({ description: "Caller is not authenticated." })
  async getDeployments(): Promise<AzureOpenAiDeploymentsResponseDto> {
    const list = this.configService.get<string>("AZURE_OPENAI_DEPLOYMENTS");
    if (list && list.trim() !== "") {
      const deployments = list
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      return { deployments };
    }

    const fallback = this.configService.get<string>("AZURE_OPENAI_DEPLOYMENT");
    return {
      deployments: fallback && fallback.trim() !== "" ? [fallback.trim()] : [],
    };
  }
}
