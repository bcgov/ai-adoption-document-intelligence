import { ApiProperty } from "@nestjs/swagger";

export class BootstrapResultDto {
  @ApiProperty({ description: "Whether bootstrap completed successfully" })
  success: boolean;

  @ApiProperty({ description: "ID of the created Default group" })
  groupId: string;

  @ApiProperty({ description: "Name of the created Default group" })
  groupName: string;
}
