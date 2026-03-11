import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class EligibleDocumentsFilterDto {
  @ApiPropertyOptional({ description: 'Page number', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  page?: number;

  @ApiPropertyOptional({ description: 'Number of items per page', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number;

  @ApiPropertyOptional({ description: 'Search string to filter documents' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by group ID' })
  @IsOptional()
  @IsString()
  group_id?: string;
}

export class EligibleDocumentDto {
  @ApiProperty({ description: 'Document ID' })
  id: string;

  @ApiProperty({ description: 'Original filename of the document' })
  originalFilename: string;

  @ApiProperty({ description: 'File type (MIME type)' })
  fileType: string;

  @ApiProperty({ description: 'Timestamp when the document was approved' })
  approvedAt: Date;

  @ApiProperty({ description: 'ID of the reviewer who approved the document' })
  reviewerId: string;

  @ApiProperty({ description: 'Number of fields in the document' })
  fieldCount: number;

  @ApiProperty({ description: 'Number of corrections made during review' })
  correctionCount: number;
}

export class EligibleDocumentsResponseDto {
  @ApiProperty({ description: 'List of eligible documents', type: () => EligibleDocumentDto, isArray: true })
  documents: EligibleDocumentDto[];

  @ApiProperty({ description: 'Total number of eligible documents' })
  total: number;

  @ApiProperty({ description: 'Current page number' })
  page: number;

  @ApiProperty({ description: 'Number of items per page' })
  limit: number;
}
