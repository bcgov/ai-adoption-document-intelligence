import { PayloadTooLargeException } from "@nestjs/common";
import { MulterError } from "multer";
import { MulterExceptionFilter } from "./multer-exception.filter";

describe("MulterExceptionFilter", () => {
  const filter = new MulterExceptionFilter();

  it("should return 413 for LIMIT_FILE_SIZE", () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
      }),
    };

    filter.catch(new MulterError("LIMIT_FILE_SIZE", "files"), host as never);

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith(
      new PayloadTooLargeException(
        "File exceeds maximum allowed size",
      ).getResponse(),
    );
  });

  it("should return 400 for other multer errors", () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
      }),
    };

    filter.catch(
      new MulterError("LIMIT_UNEXPECTED_FILE", "files"),
      host as never,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      message: "Unexpected field",
      error: "Bad Request",
    });
  });
});
