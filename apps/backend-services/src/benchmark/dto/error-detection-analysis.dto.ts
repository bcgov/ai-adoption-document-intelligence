import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ErrorDetectionCurvePointDto {
  @ApiProperty({ description: "Threshold value (0.00–1.00, step 0.01)" })
  threshold!: number;

  @ApiProperty({
    description: "True positives: flagged AND incorrect (errors caught)",
  })
  tp!: number;

  @ApiProperty({
    description: "False positives: flagged AND correct (false alarms)",
  })
  fp!: number;

  @ApiProperty({
    description: "False negatives: not flagged AND incorrect (missed errors)",
  })
  fn!: number;

  @ApiProperty({ description: "True negatives: not flagged AND correct" })
  tn!: number;
}

export class ErrorDetectionFieldDto {
  @ApiProperty({ description: "Field name" })
  name!: string;

  @ApiProperty({
    description:
      "Number of evaluable instances (with confidence and ground truth)",
  })
  evaluatedCount!: number;

  @ApiProperty({ description: "Number of incorrect instances among evaluated" })
  errorCount!: number;

  @ApiProperty({ description: "Error rate: errorCount / evaluatedCount" })
  errorRate!: number;

  @ApiProperty({
    description: "Precomputed curve, 101 points stepping 0.00 → 1.00 by 0.01",
    type: [ErrorDetectionCurvePointDto],
  })
  curve!: ErrorDetectionCurvePointDto[];

  @ApiPropertyOptional({
    description:
      "Smallest threshold whose recall ≥ 0.90, or null if unattainable",
    nullable: true,
  })
  suggestedCatch90!: number | null;

  @ApiProperty({
    description: "Threshold maximizing F1 (ties broken by smaller threshold)",
  })
  suggestedBestBalance!: number;

  @ApiPropertyOptional({
    description:
      "Largest threshold whose false-positive rate ≤ 0.10, or null if unattainable",
    nullable: true,
  })
  suggestedMinimizeReview!: number | null;
}

export class ErrorDetectionAnalysisResponseDto {
  @ApiProperty({ description: "Benchmark run ID" })
  runId!: string;

  @ApiProperty({ description: "True if the run has no evaluation results yet" })
  notReady!: boolean;

  @ApiProperty({
    description:
      "Per-field analysis (excludes fields with zero evaluable instances)",
    type: [ErrorDetectionFieldDto],
  })
  fields!: ErrorDetectionFieldDto[];

  @ApiProperty({
    description:
      "Names of fields excluded due to missing confidence or ground truth data",
    type: [String],
  })
  excludedFields!: string[];
}
