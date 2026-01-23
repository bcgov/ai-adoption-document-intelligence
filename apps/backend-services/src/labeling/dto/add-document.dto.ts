import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class AddDocumentDto {
  @ApiProperty({ description: "Document ID to add to project" })
  @IsString()
  documentId: string;
}
