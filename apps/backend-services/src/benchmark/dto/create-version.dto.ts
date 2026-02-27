import { IsObject, IsOptional, IsString } from "class-validator";

export class CreateVersionDto {
  /**
   * Optional version label. If omitted, auto-generated as v{N+1}.
   */
  @IsString()
  @IsOptional()
  version?: string;

  /**
   * Optional JSON schema for ground truth validation.
   */
  @IsObject()
  @IsOptional()
  groundTruthSchema?: Record<string, unknown>;

  /**
   * Optional manifest path. Defaults to 'dataset-manifest.json'.
   */
  @IsString()
  @IsOptional()
  manifestPath?: string;
}
