import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class SplitListItemDto {
  @ApiProperty({ description: "Split ID" })
  id: string;

  @ApiProperty({ description: "Split name" })
  name: string;

  @ApiProperty({ description: "Split type (train, val, test, golden)" })
  type: string;

  @ApiProperty({ description: "Number of samples in this split" })
  sampleCount: number;
}

export class VersionListItemDto {
  @ApiProperty({ description: "Version ID" })
  id: string;

  @ApiProperty({ description: "Version label" })
  version: string;

  @ApiProperty({ description: "Version name", nullable: true })
  name: string | null;

  @ApiProperty({ description: "Number of documents in this version" })
  documentCount: number;

  @ApiProperty({
    description: "Storage prefix for this version",
    nullable: true,
  })
  storagePrefix: string | null;

  @ApiProperty({ description: "Whether this version is frozen" })
  frozen: boolean;

  @ApiProperty({ description: "Creation timestamp" })
  createdAt: Date;

  @ApiPropertyOptional({
    description: "Splits associated with this version",
    type: () => SplitListItemDto,
    isArray: true,
  })
  splits?: SplitListItemDto[];
}

export class VersionListResponseDto {
  @ApiProperty({
    description: "List of dataset versions",
    type: () => VersionListItemDto,
    isArray: true,
  })
  versions: VersionListItemDto[];
}
