import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { SuggestionMappingDto } from "./suggestion-mapping.dto";

export enum ProjectStatus {
  ACTIVE = "active",
  ARCHIVED = "archived",
  TRAINING = "training",
}

export class CreateProjectDto {
  @ApiProperty({ description: "Project name" })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: "Project description" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: "Optional suggestion mapping for auto-labeling",
    type: SuggestionMappingDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SuggestionMappingDto)
  suggestion_mapping?: SuggestionMappingDto;
}

export class UpdateProjectDto {
  @ApiPropertyOptional({ description: "Project name" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: "Project description" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: "Optional suggestion mapping for auto-labeling",
    type: SuggestionMappingDto,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsObject()
  @ValidateNested()
  @Type(() => SuggestionMappingDto)
  suggestion_mapping?: SuggestionMappingDto | null;

  @ApiPropertyOptional({
    description: "Project status",
    enum: ProjectStatus,
  })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}
