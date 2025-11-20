import { IsJWT, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class OAuthCallbackQueryDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  @IsJWT()
  state!: string;

  @IsOptional()
  @IsString()
  session_state?: string;

  @IsOptional()
  @IsString()
  iss?: string;
}

