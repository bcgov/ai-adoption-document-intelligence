import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Identity } from "@/auth/identity.decorator";
import { AppLoggerService } from "./app-logger.service";
import { ClientErrorDto, ClientErrorResponseDto } from "./dto/client-error.dto";

/**
 * Receives client-side errors reported by the frontend ErrorBoundary and
 * writes them to the structured application log so they appear in Loki.
 */
@ApiTags("Logging")
@Controller("api/client-errors")
export class ClientErrorController {
  constructor(private readonly logger: AppLoggerService) {}

  /**
   * Report a client-side error caught by the frontend ErrorBoundary.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @Identity()
  @ApiOperation({
    summary: "Report a client-side error",
    description:
      "Accepts an error caught by the React ErrorBoundary and logs it server-side so it is captured by the structured logging pipeline.",
  })
  @ApiOkResponse({
    description: "Error received and logged",
    type: ClientErrorResponseDto,
  })
  @ApiUnauthorizedResponse({ description: "Not authenticated" })
  reportClientError(@Body() dto: ClientErrorDto): ClientErrorResponseDto {
    this.logger.error("Client-side error reported", {
      errorMessage: dto.message,
      ...(dto.componentStack && { componentStack: dto.componentStack }),
      ...(dto.errorStack && { errorStack: dto.errorStack }),
      ...(dto.url && { url: dto.url }),
      ...(dto.userAgent && { userAgent: dto.userAgent }),
    });

    return { received: true };
  }
}
