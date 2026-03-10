import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class EligibleDocumentsFilterDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  group_id?: string;
}

export class EligibleDocumentDto {
  id: string;
  originalFilename: string;
  fileType: string;
  approvedAt: Date;
  reviewerId: string;
  fieldCount: number;
  correctionCount: number;
}

export class EligibleDocumentsResponseDto {
  documents: EligibleDocumentDto[];
  total: number;
  page: number;
  limit: number;
}
