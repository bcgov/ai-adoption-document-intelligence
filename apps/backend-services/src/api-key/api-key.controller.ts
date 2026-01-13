import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import { Request } from "express";
import { ApiKeyInfo, ApiKeyService, GeneratedApiKey } from "./api-key.service";

@Controller("api/api-key")
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Get()
  async getApiKey(@Req() req: Request): Promise<{ apiKey: ApiKeyInfo | null }> {
    const user = req.user;
    const userId = user?.idir_username || user?.sub;

    if (!userId) {
      return { apiKey: null };
    }

    const apiKey = await this.apiKeyService.getUserApiKey(userId as string);
    return { apiKey };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async generateApiKey(
    @Req() req: Request,
  ): Promise<{ apiKey: GeneratedApiKey }> {
    const user = req.user;
    const userId = (user?.idir_username || user?.sub) as string;
    const userEmail = (user?.email || "unknown@example.com") as string;

    const apiKey = await this.apiKeyService.generateApiKey(userId, userEmail);
    return { apiKey };
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteApiKey(@Req() req: Request): Promise<void> {
    const user = req.user;
    const userId = (user?.idir_username || user?.sub) as string;

    await this.apiKeyService.deleteApiKey(userId);
  }

  @Post("regenerate")
  async regenerateApiKey(
    @Req() req: Request,
  ): Promise<{ apiKey: GeneratedApiKey }> {
    const user = req.user;
    const userId = (user?.idir_username || user?.sub) as string;
    const userEmail = (user?.email || "unknown@example.com") as string;

    const apiKey = await this.apiKeyService.regenerateApiKey(userId, userEmail);
    return { apiKey };
  }
}
