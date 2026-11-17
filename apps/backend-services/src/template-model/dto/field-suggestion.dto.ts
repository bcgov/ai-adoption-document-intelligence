import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";
import { FieldType } from "./field-definition.dto";

export class SuggestFieldsDto {
  @ApiProperty({
    description:
      "Labelling document id (the id the /documents/:docId routes take) whose OCR the fields are suggested from",
  })
  @IsString()
  @IsNotEmpty()
  document_id!: string;
}

export class SuggestedFieldDto {
  @ApiProperty({
    description:
      "Suggested field key: lowercase snake_case, unique within the reply",
  })
  field_key!: string;

  @ApiProperty({ description: "Suggested field type", enum: FieldType })
  field_type!: FieldType;

  @ApiProperty({
    description:
      "One-line description naming the printed caption and where the value sits",
  })
  description!: string;

  @ApiProperty({
    description:
      "The value found on this document, or null when the field is blank on it",
    nullable: true,
    type: String,
  })
  value!: string | null;

  @ApiProperty({
    description: "Page the value was found on, or null when it is blank",
    nullable: true,
    type: Number,
  })
  page_number!: number | null;

  @ApiProperty({
    description:
      "True when the template model already has a field with this key",
  })
  already_exists!: boolean;
}
