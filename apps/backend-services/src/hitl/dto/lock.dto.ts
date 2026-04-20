import { ApiProperty } from "@nestjs/swagger";

export class HeartbeatResponseDto {
  @ApiProperty({ description: "Whether the heartbeat was accepted" })
  ok!: boolean;

  @ApiProperty({ description: "New expiry time for the lock" })
  expiresAt!: Date;
}
