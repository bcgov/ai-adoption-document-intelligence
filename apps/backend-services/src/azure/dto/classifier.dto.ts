import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsString } from "class-validator";

export enum ClassifierStatus {
  PRETRAINING = "PRETRAINING",
  FAILED = "FAILED",
  TRAINING = "TRAINING",
  READY = "READY",
}

export enum ClassifierSource {
  AZURE = "AZURE",
}

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
