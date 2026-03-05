import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

/**
 * DTO for updating an existing group's name and/or description.
 * The calling user must be a system admin. Identity is derived from the JWT token.
 */
export class UpdateGroupDto {
  @ApiProperty({ description: "The new name for the group" })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: "An optional description for the group" })
  @IsString()
  @IsOptional()
  description?: string;
}
