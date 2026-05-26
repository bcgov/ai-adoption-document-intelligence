import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Request } from "express";
import { Identity } from "@/auth/identity.decorator";
import { getIdentityGroupIds } from "@/auth/identity.helpers";
import { DenoRunnerUnavailableError } from "./deno-runner.client";
import { CreateDynamicNodeRequestDto } from "./dto/create-dynamic-node-request.dto";
import { DynamicNodeDeletedResponseDto } from "./dto/dynamic-node-deleted-response.dto";
import { DynamicNodeDetailResponseDto } from "./dto/dynamic-node-detail-response.dto";
import { DynamicNodeListResponseDto } from "./dto/dynamic-node-list-response.dto";
import { DynamicNodePublishResponseDto } from "./dto/dynamic-node-publish-response.dto";
import { DynamicNodeSignatureDto } from "./dto/dynamic-node-signature.dto";
import { DynamicNodeVersionDto } from "./dto/dynamic-node-version.dto";
import { PublishErrorsResponseDto } from "./dto/publish-errors-response.dto";
import { UpdateDynamicNodeRequestDto } from "./dto/update-dynamic-node-request.dto";
import {
  DuplicateSlugError,
  DynamicNodeDeletedError,
  DynamicNodeNotFoundError,
} from "./dynamic-node.errors";
import { DynamicNodeRepository } from "./dynamic-node.repository";
import {
  DynamicNodesService,
  NameMismatchError,
  PublishValidationError,
} from "./dynamic-nodes.service";

/**
 * `DynamicNodesController` — Phase 6 Milestone B CRUD surface for dynamic
 * node lineages. All endpoints inherit the existing `x-api-key` middleware +
 * group-scoping pattern from the workflow controller.
 *
 * Endpoints:
 *  - `POST   /api/dynamic-nodes`        — create a new lineage + v1.
 *  - `PUT    /api/dynamic-nodes/:slug`  — publish a new version on an existing lineage.
 *  - `GET    /api/dynamic-nodes`        — list group's non-deleted lineages.
 *  - `GET    /api/dynamic-nodes/:slug`  — full version history for one lineage.
 *  - `DELETE /api/dynamic-nodes/:slug`  — idempotent soft-delete.
 *
 * Error mapping:
 *  - `PublishValidationError`        → 400 `{ errors }`
 *  - `DuplicateSlugError`            → 409
 *  - `NameMismatchError`             → 409 `{ code: 'NAME_MISMATCH', pathSlug, scriptName }`
 *  - `DynamicNodeNotFoundError`      → 404
 *  - `DynamicNodeDeletedError`       → 404 (matches list / detail's "invisible" semantics)
 *  - `DenoRunnerUnavailableError`    → 503 `{ code: 'DENO_RUNNER_UNAVAILABLE', message }`
 */
@ApiTags("dynamic-nodes")
@Controller("api/dynamic-nodes")
export class DynamicNodesController {
  constructor(
    private readonly dynamicNodesService: DynamicNodesService,
    private readonly repository: DynamicNodeRepository,
  ) {}

  // ---------------------------------------------------------------------
  // POST /api/dynamic-nodes  — US-165
  // ---------------------------------------------------------------------

  @Post()
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Publish a new dynamic-node lineage (v1) from a TypeScript script",
  })
  @ApiCreatedResponse({
    description:
      "Lineage created. Returns the persisted v1 slug + signature + version=1. `errors` is always `[]` on this path.",
    type: DynamicNodePublishResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      "One of the publish-time validation stages produced structured errors. The body's `errors[]` comes from a single short-circuited stage — `jsdoc-parse`, `signature-semantics`, `ts-check`, or `allowlist`.",
    type: PublishErrorsResponseDto,
  })
  @ApiConflictResponse({
    description:
      "A non-deleted lineage with this slug already exists in the caller's group. Use PUT to publish a new version instead.",
  })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  @ApiServiceUnavailableResponse({
    description:
      "The `deno-runner` sidecar is unreachable. Surface code is `DENO_RUNNER_UNAVAILABLE`.",
  })
  async create(
    @Body() dto: CreateDynamicNodeRequestDto,
    @Req() req: Request,
  ): Promise<DynamicNodePublishResponseDto> {
    const groupId = resolveCallingGroupId(req);
    try {
      const result = await this.dynamicNodesService.publish({
        groupId,
        script: dto.script,
        mode: "create",
        actorUserId: req.resolvedIdentity?.userId,
      });
      // US-173 Scenario 4 — bust the per-group catalog cache so the next
      // `GET /api/activity-catalog` re-reads the lineage list.
      this.dynamicNodesService.invalidateGroupCatalogCache(groupId);
      return {
        slug: result.slug,
        version: result.version,
        signature: result.signature as DynamicNodeSignatureDto,
        errors: [],
      };
    } catch (err) {
      throw mapPublishError(err);
    }
  }

  // ---------------------------------------------------------------------
  // PUT /api/dynamic-nodes/:slug  — US-166
  // ---------------------------------------------------------------------

  @Put(":slug")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Publish a new version on an existing dynamic-node lineage",
  })
  @ApiParam({
    name: "slug",
    description:
      "Lineage slug. MUST match the script's `@name`; mismatch returns 409 with `{ code: 'NAME_MISMATCH', pathSlug, scriptName }`.",
  })
  @ApiOkResponse({
    description:
      "New version published. The lineage's `headVersionId` now points at this version; prior version rows are unchanged.",
    type: DynamicNodePublishResponseDto,
  })
  @ApiBadRequestResponse({
    description: "Publish-time validation failure. Same error shape as POST.",
    type: PublishErrorsResponseDto,
  })
  @ApiNotFoundResponse({
    description:
      "No lineage with this slug exists in the caller's group, OR the lineage is soft-deleted.",
  })
  @ApiConflictResponse({
    description:
      "The script's `@name` does not match the path slug. Body: `{ code: 'NAME_MISMATCH', pathSlug, scriptName }`.",
  })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  @ApiServiceUnavailableResponse({
    description:
      "The `deno-runner` sidecar is unreachable. Surface code is `DENO_RUNNER_UNAVAILABLE`.",
  })
  async update(
    @Param("slug") slug: string,
    @Body() dto: UpdateDynamicNodeRequestDto,
    @Req() req: Request,
  ): Promise<DynamicNodePublishResponseDto> {
    const groupId = resolveCallingGroupId(req);
    try {
      const result = await this.dynamicNodesService.publish({
        groupId,
        pathSlug: slug,
        script: dto.script,
        mode: "update",
        actorUserId: req.resolvedIdentity?.userId,
      });
      // US-173 Scenario 4 — bust the per-group catalog cache so the next
      // `GET /api/activity-catalog` re-reads the lineage list.
      this.dynamicNodesService.invalidateGroupCatalogCache(groupId);
      return {
        slug: result.slug,
        version: result.version,
        signature: result.signature as DynamicNodeSignatureDto,
        errors: [],
      };
    } catch (err) {
      throw mapPublishError(err);
    }
  }

  // ---------------------------------------------------------------------
  // GET /api/dynamic-nodes  — US-167 Scenario 1
  // ---------------------------------------------------------------------

  @Get()
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "List the calling group's non-deleted dynamic-node lineages",
  })
  @ApiOkResponse({
    description:
      "Items sorted by `slug` ascending. Soft-deleted lineages are excluded. Each item carries `versionCount` + `usedInWorkflowCount` for the management page.",
    type: DynamicNodeListResponseDto,
  })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  async list(@Req() req: Request): Promise<DynamicNodeListResponseDto> {
    const groupId = resolveCallingGroupId(req);
    const rows = await this.repository.listForGroup(groupId);

    const items = await Promise.all(
      rows.map(async (row) => {
        const usedInWorkflowCount =
          await this.repository.countWorkflowsReferencingSlug(
            groupId,
            row.slug,
          );
        if (row.headVersion === null) {
          // Head should never be missing for a non-deleted lineage (the
          // createWithFirstVersion transaction guarantees it). If it happens,
          // surface as 500 rather than silently dropping the row.
          throw new InternalServerErrorException(
            `Lineage ${row.slug} has no head version`,
          );
        }
        return {
          slug: row.slug,
          headVersion: {
            versionNumber: row.headVersion.versionNumber,
            signature: row.headVersion
              .signature as unknown as DynamicNodeSignatureDto,
            publishedAt: row.headVersion.publishedAt.toISOString(),
          },
          versionCount: row._count.versions,
          usedInWorkflowCount,
        };
      }),
    );

    return { items };
  }

  // ---------------------------------------------------------------------
  // GET /api/dynamic-nodes/:slug  — US-167 Scenario 2 / 3
  // ---------------------------------------------------------------------

  @Get(":slug")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Get a dynamic-node lineage's full version history (newest first)",
  })
  @ApiParam({ name: "slug", description: "Lineage slug" })
  @ApiQuery({
    name: "version",
    type: Number,
    required: false,
    description:
      "Informational — signals the caller's intent to focus on a specific version. Does NOT change the response shape (the full history is always returned).",
  })
  @ApiOkResponse({
    description:
      "Lineage detail. `versions[]` is sorted by `versionNumber` descending; each carries the full script body.",
    type: DynamicNodeDetailResponseDto,
  })
  @ApiNotFoundResponse({
    description:
      "No lineage with this slug exists in the caller's group, OR the lineage is soft-deleted.",
  })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  async detail(
    @Param("slug") slug: string,
    @Query("version") _version: string | undefined,
    @Req() req: Request,
  ): Promise<DynamicNodeDetailResponseDto> {
    const groupId = resolveCallingGroupId(req);
    const lineage = await this.repository.findBySlugForGroup(groupId, slug);
    if (lineage === null) {
      throw new NotFoundException(`Dynamic node '${slug}' not found`);
    }
    if (lineage.headVersion === null) {
      throw new InternalServerErrorException(
        `Lineage ${slug} has no head version`,
      );
    }
    const versions: DynamicNodeVersionDto[] = lineage.versions.map((v) => ({
      versionNumber: v.versionNumber,
      script: v.script,
      signature: v.signature as unknown as DynamicNodeSignatureDto,
      allowNet: v.allowNet,
      deterministic: v.deterministic,
      publishedAt: v.publishedAt.toISOString(),
      publishedByUserId: v.publishedByUserId ?? undefined,
    }));
    return {
      slug: lineage.slug,
      headVersion: {
        versionNumber: lineage.headVersion.versionNumber,
        signature: lineage.headVersion
          .signature as unknown as DynamicNodeSignatureDto,
        publishedAt: lineage.headVersion.publishedAt.toISOString(),
      },
      versions,
    };
  }

  // ---------------------------------------------------------------------
  // DELETE /api/dynamic-nodes/:slug  — US-167 Scenario 4
  // ---------------------------------------------------------------------

  @Delete(":slug")
  @HttpCode(HttpStatus.OK)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary:
      "Soft-delete a dynamic-node lineage. Idempotent — re-deleting returns the original `deletedAt`.",
  })
  @ApiParam({ name: "slug", description: "Lineage slug" })
  @ApiOkResponse({
    description:
      "Lineage soft-deleted. `usedInWorkflowCount` is returned for the frontend's confirm-modal.",
    type: DynamicNodeDeletedResponseDto,
  })
  @ApiNotFoundResponse({
    description: "No lineage with this slug exists in the caller's group.",
  })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  async delete(
    @Param("slug") slug: string,
    @Req() req: Request,
  ): Promise<DynamicNodeDeletedResponseDto> {
    const groupId = resolveCallingGroupId(req);
    try {
      const usedInWorkflowCount =
        await this.repository.countWorkflowsReferencingSlug(groupId, slug);
      const deleted = await this.repository.softDelete(groupId, slug);
      const deletedAt = deleted.deletedAt;
      if (deletedAt === null) {
        // softDelete always returns a row with deletedAt set (idempotent
        // path returns the existing value, fresh path sets `now()`). A
        // null deletedAt here would indicate a repo regression.
        throw new InternalServerErrorException(
          `softDelete returned a row with null deletedAt for slug '${slug}'`,
        );
      }
      // US-173 Scenario 4 — bust the per-group catalog cache so the next
      // `GET /api/activity-catalog` re-reads the lineage list.
      this.dynamicNodesService.invalidateGroupCatalogCache(groupId);
      return {
        slug,
        deletedAt: deletedAt.toISOString(),
        usedInWorkflowCount,
      };
    } catch (err) {
      if (err instanceof DynamicNodeNotFoundError) {
        throw new NotFoundException(`Dynamic node '${slug}' not found`);
      }
      throw err;
    }
  }
}

/**
 * Pull the calling identity's single group id off the request. API-key
 * authentication encodes a single group on the key; JWT-authenticated users
 * with multiple groups MUST supply the group via a future header / query
 * (not in scope for 6.0 — Phase 7's agent uses API keys).
 *
 * Throws:
 *  - `UnauthorizedException` when no identity is resolved.
 *  - `BadRequestException` when the JWT identity has 0 OR >1 groups (the
 *    publish API needs a single group to scope persistence to).
 */
function resolveCallingGroupId(req: Request): string {
  const identity = req.resolvedIdentity;
  if (!identity) {
    throw new UnauthorizedException("Authentication required");
  }
  // Accept an explicit groupId hint from query (`?groupId=...`), header
  // (`x-group-id`), or request body. Required for system-admin callers;
  // used as a tie-breaker for non-admin users that belong to multiple groups.
  const bodyMap =
    req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>)
      : {};
  const headerGroup =
    typeof req.headers["x-group-id"] === "string"
      ? (req.headers["x-group-id"] as string)
      : null;
  const queryGroup =
    typeof req.query["groupId"] === "string"
      ? (req.query["groupId"] as string)
      : null;
  const bodyGroup =
    typeof bodyMap["groupId"] === "string"
      ? (bodyMap["groupId"] as string)
      : null;
  const requestedGroup = bodyGroup ?? queryGroup ?? headerGroup ?? null;

  const groupIds = getIdentityGroupIds(identity);
  if (groupIds === undefined) {
    if (requestedGroup === null) {
      throw new BadRequestException(
        "System-admin callers must include a `groupId` in the request body, query (`?groupId=...`), or `x-group-id` header.",
      );
    }
    return requestedGroup;
  }
  if (groupIds.length === 0) {
    throw new BadRequestException("Caller has no group membership");
  }
  if (requestedGroup !== null) {
    if (!groupIds.includes(requestedGroup)) {
      throw new BadRequestException(
        `Caller is not a member of group '${requestedGroup}'.`,
      );
    }
    return requestedGroup;
  }
  if (groupIds.length > 1) {
    throw new BadRequestException(
      "Caller belongs to multiple groups — include `groupId` in the request to disambiguate.",
    );
  }
  return groupIds[0];
}

/**
 * Map a thrown service-layer error to the appropriate NestJS HTTP exception.
 * Used by both POST and PUT handlers — keeps controller handlers thin.
 */
function mapPublishError(err: unknown): Error {
  if (err instanceof PublishValidationError) {
    return new BadRequestException({ errors: err.errors });
  }
  if (err instanceof NameMismatchError) {
    return new ConflictException({
      code: "NAME_MISMATCH",
      pathSlug: err.pathSlug,
      scriptName: err.scriptName,
    });
  }
  if (err instanceof DuplicateSlugError) {
    return new ConflictException({
      code: "DUPLICATE_SLUG",
      slug: err.slug,
    });
  }
  if (err instanceof DynamicNodeNotFoundError) {
    return new NotFoundException(err.message);
  }
  if (err instanceof DynamicNodeDeletedError) {
    return new NotFoundException(err.message);
  }
  if (err instanceof DenoRunnerUnavailableError) {
    return new ServiceUnavailableException({
      code: "DENO_RUNNER_UNAVAILABLE",
      message: err.message,
    });
  }
  // Fallthrough: re-throw to surface as 500.
  return err instanceof Error
    ? err
    : new InternalServerErrorException(String(err));
}
