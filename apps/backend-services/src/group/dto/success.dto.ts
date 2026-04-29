import { ApiProperty } from "@nestjs/swagger";

/**
 * Generic success response DTO returned when an operation completes successfully.
 */
export class SuccessDto {
  @ApiProperty({ description: "Indicates the operation was successful" })
  success!: boolean;
}
