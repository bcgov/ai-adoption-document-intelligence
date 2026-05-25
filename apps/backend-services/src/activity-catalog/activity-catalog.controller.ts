import type { ActivityCatalogEntry } from "@ai-di/graph-workflow";
import {
  BadRequestException,
  Controller,
  Get,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Request } from "express";
import { Identity } from "@/auth/identity.decorator";
import { getIdentityGroupIds } from "@/auth/identity.helpers";
import { DynamicNodesService } from "@/dynamic-nodes/dynamic-nodes.service";
import { ActivityCatalogEntryDto } from "./dto/activity-catalog-entry.dto";
import { ActivityCatalogResponseDto } from "./dto/activity-catalog-response.dto";

/**
 * `ActivityCatalogController` — Phase 6 Milestone D US-173.
 *
 * `GET /api/activity-catalog` returns the merged activity catalog:
 *   - All static catalog entries first, in their registered order.
 *   - Followed by the calling group's non-deleted dynamic-node head
 *     versions, sorted by `dynamicNodeSlug` ascending.
 *
 * Soft-deleted dynamic-node lineages are excluded (US-173 Scenario 2).
 * Cross-group isolation is enforced by the caller's resolved identity
 * (US-173 Scenario 3). Response cached per-group for 30 s by the
 * underlying `DynamicNodesService.getMergedCatalogForGroup`
 * (US-173 Scenario 4); the controller is stateless.
 */
@ApiTags("activity-catalog")
@Controller("activity-catalog")
export class ActivityCatalogController {
  constructor(private readonly dynamicNodesService: DynamicNodesService) {}

  @Get()
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary:
      "Get the merged activity catalog (static + group's dynamic nodes).",
  })
  @ApiOkResponse({
    description:
      "Merged catalog. Static entries first; dynamic entries follow, sorted by `dynamicNodeSlug` ascending.",
    type: ActivityCatalogResponseDto,
  })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  @ApiBadRequestResponse({
    description:
      "Caller has no group context (system-admin without explicit group, or membership in zero / multiple groups).",
  })
  async getCatalog(@Req() req: Request): Promise<ActivityCatalogResponseDto> {
    const groupId = resolveCallingGroupId(req);
    const entries =
      await this.dynamicNodesService.getMergedCatalogForGroup(groupId);
    return { entries: entries.map(toCatalogEntryDto) };
  }
}

/**
 * Resolve the calling identity's single group id off the request. API-key
 * authentication encodes a single group on the key; JWT-authenticated
 * users with multiple groups must supply the group via a future header
 * / query (not in scope for 6.0). System-admin requests must supply a
 * group context explicitly.
 *
 * Mirrors the dynamic-nodes controller's helper of the same name — kept
 * local rather than centralised to avoid coupling the two modules
 * through a fourth shared helper module for one inline function.
 */
function resolveCallingGroupId(req: Request): string {
  const identity = req.resolvedIdentity;
  if (!identity) {
    throw new UnauthorizedException("Authentication required");
  }
  const groupIds = getIdentityGroupIds(identity);
  if (groupIds === undefined) {
    throw new BadRequestException(
      "System-admin requests must supply a group context (not supported in Phase 6.0)",
    );
  }
  if (groupIds.length === 0) {
    throw new BadRequestException("Caller has no group membership");
  }
  if (groupIds.length > 1) {
    throw new BadRequestException(
      "Caller belongs to multiple groups — group disambiguation is not yet supported on the activity-catalog endpoint",
    );
  }
  return groupIds[0];
}

/**
 * Translate the shared `ActivityCatalogEntry` (which carries a Zod
 * `parametersSchema`) into the JSON-serialisable DTO shape. We DROP
 * `parametersSchema` (Zod doesn't round-trip over JSON) and KEEP
 * `paramsSchema` (JSON Schema 7). Static entries that have neither
 * surface `paramsSchema: undefined`; the frontend converts the Zod
 * schema from its own copy of `ACTIVITY_CATALOG` in that case.
 *
 * Every other field is passed through unchanged.
 */
function toCatalogEntryDto(
  entry: ActivityCatalogEntry,
): ActivityCatalogEntryDto {
  return {
    activityType: entry.activityType,
    displayName: entry.displayName,
    category: entry.category,
    description: entry.description,
    iconHint: entry.iconHint,
    colorHint: entry.colorHint,
    inputs: entry.inputs.map((port) => ({
      name: port.name,
      label: port.label,
      description: port.description,
      required: port.required,
      kind: port.kind,
    })),
    outputs: entry.outputs.map((port) => ({
      name: port.name,
      label: port.label,
      description: port.description,
      required: port.required,
      kind: port.kind,
    })),
    paramsSchema: entry.paramsSchema,
    nonCacheable: entry.nonCacheable,
    dynamicNodeSlug: entry.dynamicNodeSlug,
    dynamicNodeVersion: entry.dynamicNodeVersion,
    allowNet: entry.allowNet,
  };
}
