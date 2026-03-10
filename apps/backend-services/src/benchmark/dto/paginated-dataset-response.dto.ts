import { DatasetResponseDto } from "./dataset-response.dto";

export class PaginatedDatasetResponseDto {
  data: DatasetResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
