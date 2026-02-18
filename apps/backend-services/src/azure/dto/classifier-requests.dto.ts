import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsEnum, IsOptional, IsString } from "class-validator";
import {
  ClassifierSource,
} from "@/azure/dto/classifier-constants.dto";

export class ClassifierCreationDto {
  @ApiProperty()
  @IsString()
  classifierName: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty({ enum: ClassifierSource })
  @IsEnum(ClassifierSource)
  source: ClassifierSource;

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

  @ApiProperty({ required: false })
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
