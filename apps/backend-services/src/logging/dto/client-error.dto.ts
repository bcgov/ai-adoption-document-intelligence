import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

/**
 * DTO representing a client-side error reported by the frontend ErrorBoundary.
 */
export class ClientErrorDto {
  @ApiProperty({ description: "Error message from the thrown Error object" })
  @IsString()
  message!: string;

  @ApiPropertyOptional({
    description: "React component stack trace from ErrorInfo",
  })
  @IsOptional()
  @IsString()
  componentStack?: string;

  @ApiPropertyOptional({
    description: "JavaScript error stack trace from the Error object",
  })
  @IsOptional()
  @IsString()
  errorStack?: string;

  @ApiPropertyOptional({
    description: "Browser URL where the error occurred (window.location.href)",
  })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({
    description: "Browser user agent string (navigator.userAgent)",
  })
  @IsOptional()
  @IsString()
  userAgent?: string;
}

/**
 * Response DTO returned after a client error is accepted.
 */
export class ClientErrorResponseDto {
  @ApiProperty({ description: "Indicates the error was received successfully" })
  received!: boolean;
}
