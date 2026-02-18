import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsEnum, IsOptional, IsString } from "class-validator";
import { ClassifierSource } from "@/azure/dto/classifier-constants.dto";

export class ClassifierCreationDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty({ enum: ClassifierSource })
  @IsEnum(ClassifierSource)
  source: ClassifierSource;

  @ApiProperty()
  @IsString()
  group_id: string;
}

export class UploadClassifierDocumentsDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  label: string;

  @ApiProperty()
  @IsString()
  group_id: string;
}

export class DeleteClassifierDocumentsDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  group_id: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  folders?: string[];
}

export class GetClassifierDocumentsQueryDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  group_id: string;
}

export class RequestClassifierTrainingDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  group_id: string;
}

export class RequestClassificationDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  group_id: string;
}

export class GetClassificationResultQueryDto {
  @ApiProperty()
  @IsString()
  operationLocation: string;
}

export class GetTrainingResultQueryDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  group_id: string;
}
