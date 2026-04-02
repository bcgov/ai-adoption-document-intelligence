import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class AddDocumentDto {
  @ApiProperty({
    description: "Labeling document ID to add to template model",
  })
  @IsString()
  labelingDocumentId: string;
}
