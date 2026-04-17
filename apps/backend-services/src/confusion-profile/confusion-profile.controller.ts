/**
 * REST controller for confusion profiles.
 *
 * All routes are scoped to a group via the :groupId path param.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Request } from "express";
import { Identity } from "@/auth/identity.decorator";
import { identityCanAccessGroup } from "@/auth/identity.helpers";
import { ConfusionProfileService } from "./confusion-profile.service";
import {
  ConfusionProfileResponseDto,
  CreateConfusionProfileDto,
  DeriveConfusionProfileDto,
  UpdateConfusionProfileDto,
} from "./dto";

@ApiTags("Confusion Profiles")
@Controller("api/groups/:groupId/confusion-profiles")
export class ConfusionProfileController {
  private readonly logger = new Logger(ConfusionProfileController.name);

  constructor(
    private readonly confusionProfileService: ConfusionProfileService,
  ) {}

  @Post("derive")
  @HttpCode(HttpStatus.CREATED)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Derive and save a confusion profile from corrections/mismatches",
    description:
      "Gathers HITL corrections and optionally benchmark run mismatches, " +
      "computes a character-level confusion matrix with examples, and saves as a profile.",
  })
  @ApiParam({ name: "groupId", description: "Group ID" })
  @ApiCreatedResponse({
    description: "Derived confusion profile",
    type: ConfusionProfileResponseDto,
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid credentials" })
  async derive(
    @Param("groupId") groupId: string,
    @Body() dto: DeriveConfusionProfileDto,
    @Req() req: Request,
  ): Promise<ConfusionProfileResponseDto> {
    this.logger.log(`POST /api/groups/${groupId}/confusion-profiles/derive`);
    identityCanAccessGroup(req.resolvedIdentity, groupId);

    return this.confusionProfileService.deriveAndSave({
      name: dto.name,
      description: dto.description,
      groupId,
      sources: dto.sources,
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Create a confusion profile with an explicit matrix",
  })
  @ApiParam({ name: "groupId", description: "Group ID" })
  @ApiCreatedResponse({
    description: "Created confusion profile",
    type: ConfusionProfileResponseDto,
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid credentials" })
  async create(
    @Param("groupId") groupId: string,
    @Body() dto: CreateConfusionProfileDto,
    @Req() req: Request,
  ): Promise<ConfusionProfileResponseDto> {
    this.logger.log(`POST /api/groups/${groupId}/confusion-profiles`);
    identityCanAccessGroup(req.resolvedIdentity, groupId);

    return this.confusionProfileService.create({
      name: dto.name,
      description: dto.description,
      matrix: dto.matrix,
      groupId,
    });
  }

  @Get()
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "List confusion profiles in a group" })
  @ApiParam({ name: "groupId", description: "Group ID" })
  @ApiOkResponse({
    description: "List of confusion profiles",
    type: [ConfusionProfileResponseDto],
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid credentials" })
  async list(
    @Param("groupId") groupId: string,
    @Req() req: Request,
  ): Promise<ConfusionProfileResponseDto[]> {
    this.logger.log(`GET /api/groups/${groupId}/confusion-profiles`);
    identityCanAccessGroup(req.resolvedIdentity, groupId);

    return this.confusionProfileService.findByGroup(groupId);
  }

  @Get(":id")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get a confusion profile by ID" })
  @ApiParam({ name: "groupId", description: "Group ID" })
  @ApiParam({ name: "id", description: "Confusion profile ID" })
  @ApiOkResponse({
    description: "Confusion profile",
    type: ConfusionProfileResponseDto,
  })
  @ApiNotFoundResponse({ description: "Confusion profile not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid credentials" })
  async getById(
    @Param("groupId") groupId: string,
    @Param("id") id: string,
    @Req() req: Request,
  ): Promise<ConfusionProfileResponseDto> {
    this.logger.log(`GET /api/groups/${groupId}/confusion-profiles/${id}`);
    identityCanAccessGroup(req.resolvedIdentity, groupId);

    return this.confusionProfileService.findById(id);
  }

  @Patch(":id")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Update a confusion profile" })
  @ApiParam({ name: "groupId", description: "Group ID" })
  @ApiParam({ name: "id", description: "Confusion profile ID" })
  @ApiOkResponse({
    description: "Updated confusion profile",
    type: ConfusionProfileResponseDto,
  })
  @ApiNotFoundResponse({ description: "Confusion profile not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid credentials" })
  async update(
    @Param("groupId") groupId: string,
    @Param("id") id: string,
    @Body() dto: UpdateConfusionProfileDto,
    @Req() req: Request,
  ): Promise<ConfusionProfileResponseDto> {
    this.logger.log(`PATCH /api/groups/${groupId}/confusion-profiles/${id}`);
    identityCanAccessGroup(req.resolvedIdentity, groupId);

    return this.confusionProfileService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Delete a confusion profile" })
  @ApiParam({ name: "groupId", description: "Group ID" })
  @ApiParam({ name: "id", description: "Confusion profile ID" })
  @ApiNoContentResponse({ description: "Profile deleted successfully" })
  @ApiNotFoundResponse({ description: "Confusion profile not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid credentials" })
  async remove(
    @Param("groupId") groupId: string,
    @Param("id") id: string,
    @Req() req: Request,
  ): Promise<void> {
    this.logger.log(`DELETE /api/groups/${groupId}/confusion-profiles/${id}`);
    identityCanAccessGroup(req.resolvedIdentity, groupId);

    await this.confusionProfileService.delete(id);
  }
}
