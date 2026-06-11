import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  PayloadTooLargeException,
} from "@nestjs/common";
import { Response } from "express";
import { MulterError } from "multer";

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception.code === "LIMIT_FILE_SIZE") {
      const body = new PayloadTooLargeException(
        "File exceeds maximum allowed size",
      ).getResponse();
      response.status(413).json(body);
      return;
    }

    response.status(400).json({
      statusCode: 400,
      message: exception.message,
      error: "Bad Request",
    });
  }
}
