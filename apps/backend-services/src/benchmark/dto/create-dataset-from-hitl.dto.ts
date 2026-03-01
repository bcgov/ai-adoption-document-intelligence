import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";

export class CreateDatasetFromHitlDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  documentIds: string[];
}

export class AddVersionFromHitlDto {
  @IsString()
  @IsOptional()
  version?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  documentIds: string[];
}
