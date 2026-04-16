/**
 * Create Benchmark Project DTO
 *
 * Request body for creating a benchmark project.
 * See feature-docs/003-benchmarking-system/user-stories/US-010-benchmark-project-service-controller.md
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateProjectDto {
  /**
   * Project name
   */
  @ApiProperty({ description: "Project name" })
  @IsNotEmpty()
  @IsString()
  name!: string;

  /**
   * Project description (optional)
   */
  @ApiPropertyOptional({ description: "Project description" })
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * Group ID for the project
   */
  @ApiProperty({ description: "Group ID for the project" })
  @IsNotEmpty()
  @IsString()
  groupId!: string;
}
