import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString } from "class-validator";

export class CreateVersionDto {
  /**
   * Optional version label. If omitted, auto-generated as v{N+1}.
   */
  @ApiPropertyOptional({ description: 'Version label (auto-generated as v{N+1} if omitted)' })
  @IsString()
  @IsOptional()
  version?: string;

  /**
   * Optional human-readable name for this version (e.g., "Q4 invoices").
   */
  @ApiPropertyOptional({ description: 'Human-readable name for this version (e.g., "Q4 invoices")' })
  @IsString()
  @IsOptional()
  name?: string;

  /**
   * Optional JSON schema for ground truth validation.
   */
  @ApiPropertyOptional({ description: 'JSON schema for ground truth validation', type: 'object', additionalProperties: true })
  @IsObject()
  @IsOptional()
  groundTruthSchema?: Record<string, unknown>;

  /**
   * Optional manifest path. Defaults to 'dataset-manifest.json'.
   */
  @ApiPropertyOptional({ description: "Manifest path (defaults to 'dataset-manifest.json')" })
  @IsString()
  @IsOptional()
  manifestPath?: string;
}
