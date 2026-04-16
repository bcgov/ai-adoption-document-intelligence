import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Request } from "express";
import {
  ApiKeyByIdRequestDto,
  ApiKeyInfoDto,
  ApiKeyInfoWrapperDto,
  GenerateApiKeyRequestDto,
  GeneratedApiKeyDto,
  GeneratedApiKeyWrapperDto,
} from "@/actor/dto/api-key-info.dto";
import { Identity } from "@/auth/identity.decorator";
import { identityCanAccessGroup } from "@/auth/identity.helpers";
import { GroupRole } from "@/generated";
import { ApiKeyService } from "./api-key.service";

@ApiTags("API Keys")
@Controller("api/api-key")
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Get()
  @Identity({ groupIdFrom: { query: "groupId" }, minimumRole: GroupRole.ADMIN })
  @ApiOperation({ summary: "Get API key information for a group" })
  @ApiQuery({
    name: "groupId",
    description: "The group ID to look up the API key for",
  })
  @ApiOkResponse({
    description: "Returns the group's API key info if it exists",
    type: ApiKeyInfoWrapperDto,
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  @ApiUnauthorizedResponse({ description: "User is not authenticated" })
  async getApiKey(
    @Query("groupId") groupId: string,
  ): Promise<{ apiKey: ApiKeyInfoDto | null }> {
    if (!groupId) {
      throw new BadRequestException("groupId query parameter is required");
    }
    const apiKey = await this.apiKeyService.getApiKey(groupId);
    return { apiKey };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Identity({ groupIdFrom: { body: "groupId" }, minimumRole: GroupRole.ADMIN })
  @ApiOperation({ summary: "Generate a new API key for a group" })
  @ApiBody({ type: GenerateApiKeyRequestDto })
  @ApiCreatedResponse({
    description: "Returns the newly generated API key",
    type: GeneratedApiKeyWrapperDto,
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  @ApiUnauthorizedResponse({ description: "User is not authenticated" })
  async generateApiKey(
    @Req() req: Request,
    @Body() body: GenerateApiKeyRequestDto,
  ): Promise<{ apiKey: GeneratedApiKeyDto }> {
    const userId = req.resolvedIdentity?.userId ?? "";
    if (!userId) {
      throw new BadRequestException(
        "User ID is required to generate an API key",
      );
    }
    const apiKey = await this.apiKeyService.createApiKey(userId, body.groupId);
    return { apiKey };
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Identity()
  @ApiOperation({ summary: "Delete the API key by its ID" })
  @ApiQuery({
    name: "id",
    description: "The ID of the API key to delete",
  })
  @ApiNoContentResponse({ description: "API key deleted successfully" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  @ApiUnauthorizedResponse({ description: "User is not authenticated" })
  async deleteApiKey(
    @Req() req: Request,
    @Query("id") id: string,
  ): Promise<void> {
    if (!id) {
      throw new BadRequestException("id query parameter is required");
    }
    const groupId = await this.apiKeyService.getApiKeyGroupId(id);
    identityCanAccessGroup(req.resolvedIdentity, groupId, GroupRole.ADMIN);
    await this.apiKeyService.deleteApiKey(id);
  }

  @Post("regenerate")
  @Identity()
  @ApiOperation({ summary: "Regenerate the API key by its ID" })
  @ApiBody({ type: ApiKeyByIdRequestDto })
  @ApiOkResponse({
    description: "Returns the newly generated API key",
    type: GeneratedApiKeyWrapperDto,
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  @ApiUnauthorizedResponse({ description: "User is not authenticated" })
  async regenerateApiKey(
    @Req() req: Request,
    @Body() body: ApiKeyByIdRequestDto,
  ): Promise<{ apiKey: GeneratedApiKeyDto }> {
    const userId = req.resolvedIdentity?.userId ?? "";
    if (!userId) {
      throw new BadRequestException(
        "User ID is required to regenerate an API key",
      );
    }
    const groupId = await this.apiKeyService.getApiKeyGroupId(body.id);
    identityCanAccessGroup(req.resolvedIdentity, groupId, GroupRole.ADMIN);
    const apiKey = await this.apiKeyService.regenerateApiKey(userId, body.id);
    return { apiKey };
  }
}
