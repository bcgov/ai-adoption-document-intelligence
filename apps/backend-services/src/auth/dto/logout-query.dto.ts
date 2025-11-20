import { IsJWT, IsOptional } from "class-validator";

export class LogoutQueryDto {
  @IsOptional()
  @IsJWT()
  id_token_hint?: string;
}

