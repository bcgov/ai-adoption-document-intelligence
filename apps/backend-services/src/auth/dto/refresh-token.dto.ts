import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  refresh_token!: string;
}

export class RefreshReturnDto {
  @ApiProperty()
  refresh_token: string;

  @ApiProperty()
  access_token: string;

  @ApiProperty()
  id_token: string;

  @ApiProperty()
  expires_in: number;
}
