/**
 * Request body for deriving a confusion matrix from HITL corrections.
 */

import { IsArray, IsOptional, IsString } from "class-validator";

export class ConfusionMatrixDeriveDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fieldKeys?: string[];
}
