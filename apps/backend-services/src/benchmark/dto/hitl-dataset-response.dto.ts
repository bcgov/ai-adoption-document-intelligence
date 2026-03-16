import { ApiProperty } from "@nestjs/swagger";
import { DatasetResponseDto } from "./dataset-response.dto";
import { VersionResponseDto } from "./version-response.dto";

export class SkippedDocumentDto {
  @ApiProperty({ description: "ID of the skipped document" })
  documentId: string;

  @ApiProperty({ description: "Reason the document was skipped" })
  reason: string;
}

export class CreateDatasetFromHitlResponseDto {
  @ApiProperty({
    description: "The newly created dataset",
    type: () => DatasetResponseDto,
  })
  dataset: DatasetResponseDto;

  @ApiProperty({
    description: "The initial version created for the dataset",
    type: () => VersionResponseDto,
  })
  version: VersionResponseDto;

  @ApiProperty({
    description: "Documents that could not be processed",
    type: () => SkippedDocumentDto,
    isArray: true,
  })
  skipped: SkippedDocumentDto[];
}

export class AddVersionFromHitlResponseDto {
  @ApiProperty({
    description: "The newly created version",
    type: () => VersionResponseDto,
  })
  version: VersionResponseDto;

  @ApiProperty({
    description: "Documents that could not be processed",
    type: () => SkippedDocumentDto,
    isArray: true,
  })
  skipped: SkippedDocumentDto[];
}
