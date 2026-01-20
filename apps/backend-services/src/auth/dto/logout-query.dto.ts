import { ApiProperty } from "@nestjs/swagger";
import { IsJWT, IsOptional } from "class-validator";

export class LogoutQueryDto {
  @IsOptional()
  @IsJWT()
  @ApiProperty()
  id_token_hint?: string;
}
