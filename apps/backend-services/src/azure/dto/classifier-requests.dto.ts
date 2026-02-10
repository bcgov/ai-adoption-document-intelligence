import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsOptional, IsArray } from "class-validator";

export class UploadClassifierDocumentsDto {
  @ApiProperty()
  @IsString()
  classifierName: string;

  @ApiProperty()
  @IsString()
  label: string;

  @ApiProperty()
  @IsString()
  groupId: string;
}

export class DeleteClassifierDocumentsDto {
  @ApiProperty()
  @IsString()
  classifierName: string;

  @ApiProperty()
  @IsString()
  groupId: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  folders?: string[];
}

export class RequestClassifierTrainingDto {
  @ApiProperty()
  @IsString()
  classifierName: string;

  @ApiProperty()
  @IsString()
  groupId: string;
}

export class RequestClassificationDto {
  @ApiProperty()
  @IsString()
  classifierName: string;

  @ApiProperty()
  @IsString()
  groupId: string;
}

export class GetClassificationResultQueryDto {
  @ApiProperty()
  @IsString()
  operationLocation: string;
}

export class GetTrainingResultQueryDto {
  @ApiProperty()
  @IsString()
  classifierName: string;

  @ApiProperty()
  @IsString()
  groupId: string;
}
