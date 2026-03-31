import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";

export class StartTrainingDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._~-]{1,63}$/, {
    message:
      'Model ID must be 2-64 chars, start with a letter/number, and only include letters, numbers, ".", "_", "~", or "-"',
  })
  modelId: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;
}
