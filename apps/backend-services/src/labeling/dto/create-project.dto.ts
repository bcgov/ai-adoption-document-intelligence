import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsOptional,
  IsString,
} from "class-validator";

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
    description: "Project status",
    enum: ProjectStatus,
  })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}
