import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

/**
 * DTO for creating a new group.
 * The calling user must be a system admin. Identity is derived from the JWT token.
 */
export class CreateGroupDto {
  @ApiProperty({ description: "The name of the group to create" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: "An optional description for the group" })
  @IsString()
  @IsOptional()
  description?: string;
}
