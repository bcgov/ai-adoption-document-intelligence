import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

export enum TemplateModelStatus {
  DRAFT = "draft",
  TRAINING = "training",
  TRAINED = "trained",
  FAILED = "failed",
}

export class CreateTemplateModelDto {
  @ApiProperty({ description: "Template model name" })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: "Template model description" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: "Group ID" })
  @IsString()
  @IsNotEmpty()
  group_id!: string;
}

export class UpdateTemplateModelDto {
  @ApiPropertyOptional({ description: "Template model name" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: "Template model description" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: "Template model status",
    enum: TemplateModelStatus,
  })
  @IsOptional()
  @IsEnum(TemplateModelStatus)
  status?: TemplateModelStatus;
}
