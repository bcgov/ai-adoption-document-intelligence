import { ApiProperty } from "@nestjs/swagger";

class ProtectedUserDto {
  @ApiProperty({ required: false })
  idirUsername?: string;

  @ApiProperty({ required: false })
  displayName?: string;

  @ApiProperty({ required: false })
  email?: string;
}

export class ProtectedDataResponseDto {
  @ApiProperty()
  message: string;

  @ApiProperty({ type: ProtectedUserDto })
  user: ProtectedUserDto;
}
