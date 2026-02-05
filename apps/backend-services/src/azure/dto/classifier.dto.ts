import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsString } from "class-validator";
import { ClassifierSource, ClassifierStatus } from "@/generated";

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
