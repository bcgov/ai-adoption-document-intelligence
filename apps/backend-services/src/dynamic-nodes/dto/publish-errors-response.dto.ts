import { ApiProperty } from "@nestjs/swagger";
import { ParseErrorDto } from "./parse-error.dto";

/**
 * 400-response body for `POST` / `PUT` when one of the publish-time
 * validation stages produces structured errors. The Phase 7 agent reads
 * `errors[]` directly and revises against the offending source line/column.
 */
export class PublishErrorsResponseDto {
  @ApiProperty({
    type: [ParseErrorDto],
    description:
      "One or more structured errors. Always non-empty on the 400 path. Errors come from a single short-circuited stage — the controller does NOT mix stages in one response.",
  })
  errors!: ParseErrorDto[];
}
