import { ApiProperty } from "@nestjs/swagger";

export class BootstrapStatusResponseDto {
  @ApiProperty({
    description:
      "Whether system bootstrap is still needed (no system admins exist)",
  })
  needed!: boolean;

  @ApiProperty({
    description: "Whether the current caller is eligible to perform bootstrap",
  })
  eligible!: boolean;
}
