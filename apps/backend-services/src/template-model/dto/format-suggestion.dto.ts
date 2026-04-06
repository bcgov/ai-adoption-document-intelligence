import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString } from "class-validator";

export class FormatSpecDto {
  @ApiProperty({
    description:
      "Canonicalize operation(s). Available: digits, uppercase, lowercase, strip-spaces, text, number, date:FORMAT, noop. Chainable with |.",
    example: "digits",
  })
  canonicalize: string;

  @ApiPropertyOptional({
    description: "Regex pattern the canonicalized value must match",
    example: "^\\d{9}$",
  })
  pattern?: string;

  @ApiPropertyOptional({
    description: "Display template using # as digit placeholder",
    example: "(###) ###-####",
  })
  displayTemplate?: string;
}

export class SuggestFormatsDto {
  @ApiPropertyOptional({
    type: [String],
    description: "Benchmark run IDs to include mismatch data from",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  benchmarkRunIds?: string[];
}

export class FormatSuggestionResponseDto {
  @ApiProperty({
    description: "The field key this suggestion applies to",
    example: "sin",
  })
  fieldKey: string;

  @ApiProperty({
    description: "Suggested format specification",
    type: FormatSpecDto,
  })
  formatSpec: FormatSpecDto;

  @ApiProperty({
    description: "AI rationale for the suggestion",
    example: "All 22 corrections strip spaces/dashes from 9-digit values",
  })
  rationale: string;

  @ApiProperty({
    description: "Number of corrections analyzed for this field",
    example: 22,
  })
  sampleCount: number;
}
