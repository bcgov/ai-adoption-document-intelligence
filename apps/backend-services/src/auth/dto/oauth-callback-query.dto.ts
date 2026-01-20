import { ApiProperty } from "@nestjs/swagger";
import { IsJWT, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class OAuthCallbackQueryDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  @IsJWT()
  @ApiProperty()
  state!: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  session_state?: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  iss?: string;
}
