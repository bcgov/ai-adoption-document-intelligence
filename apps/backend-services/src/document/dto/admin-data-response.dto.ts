import { ApiProperty } from "@nestjs/swagger";

class AdminUserDto {
  @ApiProperty({ required: false })
  idirUsername?: string;

  @ApiProperty({ required: false })
  displayName?: string;

  @ApiProperty({ required: false })
  email?: string;

  @ApiProperty({ type: [String] })
  roles: string[];
}

export class AdminDataResponseDto {
  @ApiProperty()
  message: string;

  @ApiProperty({ type: AdminUserDto })
  user: AdminUserDto;
}
