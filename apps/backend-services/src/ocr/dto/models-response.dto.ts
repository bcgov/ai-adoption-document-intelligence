import { ApiProperty } from "@nestjs/swagger";

export class ModelsResponseDto {
  @ApiProperty({
    type: [String],
    description: "Prebuilt model ids and trained model ids, sorted",
  })
  models!: string[];
}
