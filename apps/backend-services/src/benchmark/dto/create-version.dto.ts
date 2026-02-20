import { IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";

export class CreateVersionDto {
  @IsString()
  @IsNotEmpty()
  version: string;

  @IsObject()
  @IsOptional()
  groundTruthSchema?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  manifestPath?: string;
}
