import { IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";

export class CreateDatasetDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsString()
  @IsNotEmpty()
  repositoryUrl: string;
}
