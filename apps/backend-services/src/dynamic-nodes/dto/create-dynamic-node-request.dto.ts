import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

/** Hard cap on script size (~100 KB) enforced via class-validator. */
export const DYNAMIC_NODE_SCRIPT_MAX_LENGTH = 100_000;

/**
 * Request body for `POST /api/dynamic-nodes`. The script's `@name` JSDoc
 * tag determines the lineage's slug — there is intentionally no separate
 * `slug` field in the body. The parser surfaces a `signature-semantics`
 * error if `@name` is missing or malformed.
 */
export class CreateDynamicNodeRequestDto {
  @ApiProperty({
    description:
      "Full TypeScript source for the dynamic node, including the JSDoc signature header. The script's `@name` JSDoc tag determines the lineage slug.",
    example:
      '/**\n * @workflow-node\n * @name my-node\n * @description ...\n * @inputs { document: { kind: "Document", required: true } }\n * @outputs { result: { kind: "Artifact" } }\n */\nexport default async function dynamicNode(ctx, params) {\n  return { result: ctx.document };\n}',
    maxLength: DYNAMIC_NODE_SCRIPT_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(DYNAMIC_NODE_SCRIPT_MAX_LENGTH)
  script!: string;
}
