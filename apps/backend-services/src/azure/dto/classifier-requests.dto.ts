import { ClassifierSource, ClassifierStatus } from "@/azure/dto/classifier-constants.dto";
import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsOptional, IsArray, IsEnum } from "class-validator";

export class ClassifierCreationDto {
  @ApiProperty()
  @IsString()
  classifierName: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsEnum(ClassifierSource)
  source: ClassifierSource;

  @ApiProperty()
  @IsEnum(ClassifierStatus)
  status: ClassifierStatus;

  @ApiProperty()
  @IsString()
  groupId: string;
}

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
