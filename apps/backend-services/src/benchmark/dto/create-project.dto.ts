/**
 * Create Benchmark Project DTO
 *
 * Request body for creating a benchmark project.
 * See feature-docs/003-benchmarking-system/user-stories/US-010-benchmark-project-service-controller.md
 */

import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateProjectDto {
  /**
   * Project name
   */
  @IsNotEmpty()
  @IsString()
  name: string;

  /**
   * Project description (optional)
   */
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * User who created the project
   */
  @IsNotEmpty()
  @IsString()
  createdBy: string;
}
