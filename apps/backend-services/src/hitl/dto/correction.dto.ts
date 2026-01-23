import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export enum CorrectionAction {
  CONFIRMED = "confirmed",
  CORRECTED = "corrected",
  FLAGGED = "flagged",
  DELETED = "deleted",
}

export class CorrectionDto {
  @ApiProperty({ description: "Field key being corrected" })
  @IsString()
  field_key: string;

  @ApiPropertyOptional({ description: "Original extracted value" })
  @IsOptional()
  @IsString()
  original_value?: string;

  @ApiPropertyOptional({ description: "Corrected value" })
  @IsOptional()
  @IsString()
  corrected_value?: string;

  @ApiPropertyOptional({ description: "Original confidence score" })
  @IsOptional()
  @IsNumber()
  original_conf?: number;

  @ApiProperty({
    description: "Action taken on this field",
    enum: CorrectionAction,
    default: CorrectionAction.CONFIRMED,
  })
  @IsEnum(CorrectionAction)
  action: CorrectionAction;
}

export class SubmitCorrectionsDto {
  @ApiProperty({
    description: "Array of field corrections",
    type: [CorrectionDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CorrectionDto)
  corrections: CorrectionDto[];
}

export class EscalateDto {
  @ApiProperty({ description: "Reason for escalation" })
  @IsString()
  reason: string;
}
