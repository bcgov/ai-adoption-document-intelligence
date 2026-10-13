import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class ListModelsQueryDto {
  @ApiPropertyOptional({
    description:
      "Group whose trained models to list. Omit it to list the trained models of every group the caller belongs to.",
  })
  @IsOptional()
  @IsString()
  group_id?: string;
}
