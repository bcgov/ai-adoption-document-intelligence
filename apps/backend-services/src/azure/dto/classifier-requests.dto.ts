import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsEnum,
  IsNotIn,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";
import {
  ClassifierSource,
  RESERVED_CLASSIFIER_LABELS,
} from "@/azure/dto/classifier-constants.dto";

/**
 * Matches a value none of whose `/`-separated segments is `.` or `..`.
 * Classifier names, labels and folders become blob storage path segments, and
 * a storage path must not contain a dot segment.
 */
const NO_DOT_SEGMENT_PATTERN = /^(?![\s\S]*(?:^|\/)\.{1,2}(?:\/|$))/;

const NO_DOT_SEGMENT_RULE =
  "Must not contain a '.' or '..' path segment, because the value becomes part of a blob storage path.";

/** Rejects a value that contains a `.` or `..` path segment. */
const HasNoDotSegment = (): PropertyDecorator =>
  Matches(NO_DOT_SEGMENT_PATTERN, {
    message: "$property must not contain a '.' or '..' path segment",
  });

export class ClassifierCreationDto {
  @ApiProperty({
    description: `Classifier name. ${NO_DOT_SEGMENT_RULE}`,
    pattern: NO_DOT_SEGMENT_PATTERN.source,
  })
  @IsString()
  @HasNoDotSegment()
  name!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiProperty({ enum: ClassifierSource })
  @IsEnum(ClassifierSource)
  source!: ClassifierSource;

  @ApiProperty()
  @IsString()
  group_id!: string;
}

export class UpdateClassifierDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  group_id!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ClassifierSource, required: false })
  @IsOptional()
  @IsEnum(ClassifierSource)
  source?: ClassifierSource;
}

export class UploadClassifierDocumentsDto {
  @ApiProperty({
    description: `Classifier name. ${NO_DOT_SEGMENT_RULE}`,
    pattern: NO_DOT_SEGMENT_PATTERN.source,
  })
  @IsString()
  @HasNoDotSegment()
  name!: string;

  @ApiProperty({
    description: `Label name. The following labels are reserved and cannot be used: ${RESERVED_CLASSIFIER_LABELS.join(", ")}. ${NO_DOT_SEGMENT_RULE}`,
    pattern: NO_DOT_SEGMENT_PATTERN.source,
  })
  @Transform(({ value }: { value: string }) =>
    typeof value === "string" ? value.toLowerCase().trim() : value,
  )
  @IsString()
  @IsNotIn([...RESERVED_CLASSIFIER_LABELS], {
    message: `Label must not be a reserved name (${RESERVED_CLASSIFIER_LABELS.join(", ")})`,
  })
  @HasNoDotSegment()
  label!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  files?: Express.Multer.File[];
}

export class DeleteClassifierDocumentsDto {
  @ApiProperty({
    description: `Classifier name. ${NO_DOT_SEGMENT_RULE}`,
    pattern: NO_DOT_SEGMENT_PATTERN.source,
  })
  @IsString()
  @HasNoDotSegment()
  name!: string;

  @ApiProperty()
  @IsString()
  group_id!: string;

  @ApiProperty({
    required: false,
    description: `Label folder to delete; omit to delete all of the classifier's documents. ${NO_DOT_SEGMENT_RULE}`,
    pattern: NO_DOT_SEGMENT_PATTERN.source,
  })
  @IsOptional()
  @IsString()
  @HasNoDotSegment()
  folder?: string;
}

export class GetClassifierDocumentsQueryDto {
  @ApiProperty({
    description: `Classifier name. ${NO_DOT_SEGMENT_RULE}`,
    pattern: NO_DOT_SEGMENT_PATTERN.source,
  })
  @IsString()
  @HasNoDotSegment()
  name!: string;

  @ApiProperty()
  @IsString()
  group_id!: string;
}

export class RequestClassifierTrainingDto {
  @ApiProperty({
    description: `Classifier name. ${NO_DOT_SEGMENT_RULE}`,
    pattern: NO_DOT_SEGMENT_PATTERN.source,
  })
  @IsString()
  @HasNoDotSegment()
  name!: string;

  @ApiProperty()
  @IsString()
  group_id!: string;
}

export class RequestClassificationDto {
  @ApiProperty()
  @IsString()
  name!: string;
}

export class GetClassificationResultQueryDto {
  @ApiProperty({
    description:
      "Operation location returned when classification was requested. It must name a classifier of the group in group_id.",
  })
  @IsString()
  operationLocation!: string;

  @ApiProperty({ description: "Group that owns the classifier." })
  @IsString()
  group_id!: string;
}

export class GetTrainingResultQueryDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  group_id!: string;
}
