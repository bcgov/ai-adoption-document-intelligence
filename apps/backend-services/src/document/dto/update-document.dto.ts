import { ApiProperty } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString } from "class-validator";

/**
 * DTO for updating editable fields of a Document.
 *
 * Allows updating the document title and/or metadata.
 * All fields are optional; at least one should be provided.
 */
export class UpdateDocumentDto {
  @ApiProperty({
    description: "New title for the document",
    required: false,
  })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({
    description: "Updated metadata for the document",
    required: false,
    type: Object,
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
