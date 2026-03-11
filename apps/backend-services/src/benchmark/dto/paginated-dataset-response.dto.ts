import { ApiProperty } from "@nestjs/swagger";
import { DatasetResponseDto } from "./dataset-response.dto";

export class PaginatedDatasetResponseDto {
  @ApiProperty({ description: 'List of datasets', type: () => DatasetResponseDto, isArray: true })
  data: DatasetResponseDto[];

  @ApiProperty({ description: 'Total number of datasets' })
  total: number;

  @ApiProperty({ description: 'Current page number' })
  page: number;

  @ApiProperty({ description: 'Number of items per page' })
  limit: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;
}
