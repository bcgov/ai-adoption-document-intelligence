import { IsInt, IsOptional, IsString, Min } from "class-validator";
import { Transform } from "class-transformer";

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
