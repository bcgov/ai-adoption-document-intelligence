import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import { DYNAMIC_NODE_SCRIPT_MAX_LENGTH } from "./create-dynamic-node-request.dto";

/**
 * Request body for `PUT /api/dynamic-nodes/:slug`. Carries the same
 * `script` shape as `CreateDynamicNodeRequestDto`. The script's `@name`
 * must match the path slug; otherwise the service throws
 * `NameMismatchError` → HTTP 409.
 */
export class UpdateDynamicNodeRequestDto {
  @ApiProperty({
    description:
      "Full TypeScript source for the new version. The script's `@name` JSDoc tag MUST match the path slug; mismatch returns 409 with `{ code: 'NAME_MISMATCH', pathSlug, scriptName }`.",
    maxLength: DYNAMIC_NODE_SCRIPT_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(DYNAMIC_NODE_SCRIPT_MAX_LENGTH)
  script!: string;
}
