import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { ClassifierSource } from "@/azure/dto/classifier-constants.dto";

export class ClassifierCreationDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiProperty({ enum: ClassifierSource })
  @IsEnum(ClassifierSource)
  source!: ClassifierSource;

  @ApiProperty()
  @IsString()
  group_id!: string;
}

export class UpdateClassifierDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  group_id!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ClassifierSource, required: false })
  @IsOptional()
  @IsEnum(ClassifierSource)
  source?: ClassifierSource;
}

export class UploadClassifierDocumentsDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  label!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  files?: Express.Multer.File[];
}

export class DeleteClassifierDocumentsDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  group_id!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  folder?: string;
}

export class GetClassifierDocumentsQueryDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  group_id!: string;
}

export class RequestClassifierTrainingDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  group_id!: string;
}

export class RequestClassificationDto {
  @ApiProperty()
  @IsString()
  name!: string;
}

export class GetClassificationResultQueryDto {
  @ApiProperty()
  @IsString()
  operationLocation!: string;
}

export class GetTrainingResultQueryDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  group_id!: string;
}
