import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { KeycloakSSOAuth } from "@/decorators/custom-auth-decorators";
import { User } from "../auth/types";
import { BootstrapService } from "./bootstrap.service";

@ApiTags("Bootstrap")
@Controller("api/bootstrap")
export class BootstrapController {
  constructor(private readonly bootstrapService: BootstrapService) {}

  @ApiOperation({
    summary: "Check if system bootstrap is needed and if the caller is eligible",
  })
  @ApiResponse({
    status: 200,
    description:
      "Returns whether bootstrap is needed and whether the caller is eligible.",
  })
  @KeycloakSSOAuth()
  @Get("status")
  async getBootstrapStatus(
    @Req() req: Request & { user?: User },
  ): Promise<{ needed: boolean; eligible: boolean }> {
    const userEmail = req.user?.email;
    return this.bootstrapService.getBootstrapStatus(userEmail);
  }

  @ApiOperation({
    summary:
      "Bootstrap the system: promote caller to admin, create Default group",
  })
  @ApiResponse({
    status: 200,
    description: "Bootstrap completed successfully.",
  })
  @ApiResponse({
    status: 403,
    description: "Caller email does not match BOOTSTRAP_ADMIN_EMAIL.",
  })
  @ApiResponse({
    status: 409,
    description: "Bootstrap already completed — a system admin exists.",
  })
  @KeycloakSSOAuth()
  @Post()
  async performBootstrap(
    @Req() req: Request & { user?: User },
  ): Promise<{ success: boolean; groupId: string; groupName: string }> {
    const userId = req.resolvedIdentity?.userId;
    if (!userId) {
      throw new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED);
    }
    const userEmail = req.user?.email;
    const result = await this.bootstrapService.performBootstrap(
      userId,
      userEmail,
    );
    return { success: true, ...result };
  }
}
