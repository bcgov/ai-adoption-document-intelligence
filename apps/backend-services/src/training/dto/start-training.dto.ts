import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class StartTrainingDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'Model ID must be kebab-case (lowercase letters, numbers, and hyphens only)',
  })
  modelId: string;

  @IsString()
  @IsOptional()
  description?: string;
}
