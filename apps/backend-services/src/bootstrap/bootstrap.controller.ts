import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Request } from "express";
import { Identity } from "@/auth/identity.decorator";
import { User } from "../auth/types";
import { BootstrapService } from "./bootstrap.service";
import { BootstrapResultDto, BootstrapStatusResponseDto } from "./dto";

@ApiTags("Bootstrap")
@Controller("api/bootstrap")
export class BootstrapController {
  constructor(private readonly bootstrapService: BootstrapService) {}

  @ApiOperation({
    summary:
      "Check if system bootstrap is needed and if the caller is eligible",
  })
  @ApiOkResponse({
    type: BootstrapStatusResponseDto,
    description:
      "Returns whether bootstrap is needed and whether the caller is eligible.",
  })
  @ApiUnauthorizedResponse({ description: "User is not authenticated." })
  @Identity()
  @Get("status")
  async getBootstrapStatus(
    @Req() req: Request & { user?: User },
  ): Promise<BootstrapStatusResponseDto> {
    const userEmail = req.user?.email;
    return this.bootstrapService.getBootstrapStatus(userEmail);
  }

  @ApiOperation({
    summary:
      "Bootstrap the system: promote caller to admin, create Default group",
  })
  @ApiOkResponse({
    type: BootstrapResultDto,
    description: "Bootstrap completed successfully.",
  })
  @ApiUnauthorizedResponse({ description: "User is not authenticated." })
  @ApiForbiddenResponse({
    description: "Caller email does not match BOOTSTRAP_ADMIN_EMAIL.",
  })
  @ApiConflictResponse({
    description: "Bootstrap already completed — a system admin exists.",
  })
  @Identity()
  @Post()
  async performBootstrap(
    @Req() req: Request & { user?: User },
  ): Promise<BootstrapResultDto> {
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
