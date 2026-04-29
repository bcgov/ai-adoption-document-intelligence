import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ColumnDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty({
    enum: ["string", "number", "boolean", "date", "datetime", "enum"],
  })
  type!: "string" | "number" | "boolean" | "date" | "datetime" | "enum";
  @ApiPropertyOptional() required?: boolean;
  @ApiPropertyOptional({ type: String, isArray: true }) enumValues?: string[];
  @ApiPropertyOptional() unique?: boolean;
}
