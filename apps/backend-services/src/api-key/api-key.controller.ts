import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import {
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Request } from "express";
import {
  ApiKeyInfoDto,
  ApiKeyInfoWrapperDto,
  GenerateApiKeyRequestDto,
  GeneratedApiKeyDto,
  GeneratedApiKeyWrapperDto,
} from "@/api-key/dto/api-key-info.dto";
import { KeycloakSSOAuth } from "@/decorators/custom-auth-decorators";
import { ApiKeyService } from "./api-key.service";

@ApiTags("API Keys")
@Controller("api/api-key")
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Get()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get the current user's API key information" })
  @ApiOkResponse({
    description: "Returns the user's API key if it exists",
    type: ApiKeyInfoWrapperDto,
  })
  @ApiUnauthorizedResponse({ description: "User is not authenticated" })
  async getApiKey(
    @Req() req: Request,
  ): Promise<{ apiKey: ApiKeyInfoDto | null }> {
    const user = req.user;
    const userId = user?.sub;

    if (!userId) {
      return { apiKey: null };
    }

    const apiKey = await this.apiKeyService.getUserApiKey(userId as string);
    return { apiKey };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Generate a new API key for the current user" })
  @ApiBody({ type: GenerateApiKeyRequestDto })
  @ApiCreatedResponse({
    description: "Returns the newly generated API key",
    type: GeneratedApiKeyWrapperDto,
  })
  @ApiConflictResponse({
    description:
      "User already has an API key. Delete it first or use regenerate.",
  })
  @ApiUnauthorizedResponse({ description: "User is not authenticated" })
  async generateApiKey(
    @Req() req: Request,
    @Body() body: GenerateApiKeyRequestDto,
  ): Promise<{ apiKey: GeneratedApiKeyDto }> {
    const user = req.user;
    const userId = user?.sub as string;
    if (!userId) {
      throw new BadRequestException(
        "User ID is required to generate an API key",
      );
    }
    const apiKey = await this.apiKeyService.generateApiKey(
      userId,
      body.groupId,
    );
    return { apiKey };
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Delete the current user's API key" })
  @ApiNoContentResponse({ description: "API key deleted successfully" })
  @ApiUnauthorizedResponse({ description: "User is not authenticated" })
  async deleteApiKey(@Req() req: Request): Promise<void> {
    const user = req.user;
    const userId = user?.sub as string;

    await this.apiKeyService.deleteApiKey(userId);
  }

  @Post("regenerate")
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Regenerate the current user's API key" })
  @ApiBody({ type: GenerateApiKeyRequestDto })
  @ApiOkResponse({
    description: "Returns the newly generated API key",
    type: GeneratedApiKeyWrapperDto,
  })
  @ApiUnauthorizedResponse({ description: "User is not authenticated" })
  async regenerateApiKey(
    @Req() req: Request,
    @Body() body: GenerateApiKeyRequestDto,
  ): Promise<{ apiKey: GeneratedApiKeyDto }> {
    const user = req.user;
    const userId = user?.sub as string;
    if (!userId) {
      throw new BadRequestException(
        "User ID is required to regenerate an API key",
      );
    }
    const apiKey = await this.apiKeyService.regenerateApiKey(
      userId,
      body.groupId,
    );
    return { apiKey };
  }
}
