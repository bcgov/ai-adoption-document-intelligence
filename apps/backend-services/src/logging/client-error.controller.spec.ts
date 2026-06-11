import { Test, TestingModule } from "@nestjs/testing";
import { AppLoggerService } from "./app-logger.service";
import { ClientErrorController } from "./client-error.controller";
import { ClientErrorDto } from "./dto/client-error.dto";

describe("ClientErrorController", () => {
  let controller: ClientErrorController;
  let logger: AppLoggerService;

  const mockLogger = {
    error: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientErrorController],
      providers: [
        {
          provide: AppLoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    controller = module.get<ClientErrorController>(ClientErrorController);
    logger = module.get<AppLoggerService>(AppLoggerService);
  });

  describe("reportClientError", () => {
    it("should log the error message and return received: true", () => {
      const dto: ClientErrorDto = { message: "Something broke" };

      const result = controller.reportClientError(dto);

      expect(result).toEqual({ received: true });
      expect(logger.error).toHaveBeenCalledWith(
        "Client-side error reported",
        expect.objectContaining({ errorMessage: "Something broke" }),
      );
    });

    it("should include all optional fields in log context when provided", () => {
      const dto: ClientErrorDto = {
        message: "Render error",
        componentStack: "  at MyComponent\n  at App",
        errorStack: "Error: Render error\n  at MyComponent (index.js:10:5)",
        url: "https://example.com/queue",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      };

      controller.reportClientError(dto);

      expect(logger.error).toHaveBeenCalledWith(
        "Client-side error reported",
        expect.objectContaining({
          errorMessage: "Render error",
          componentStack: dto.componentStack,
          errorStack: dto.errorStack,
          url: dto.url,
          userAgent: dto.userAgent,
        }),
      );
    });

    it("should omit optional fields from log context when not provided", () => {
      const dto: ClientErrorDto = { message: "Error without extras" };

      controller.reportClientError(dto);

      expect(logger.error).toHaveBeenCalledWith(
        "Client-side error reported",
        expect.not.objectContaining({
          componentStack: expect.anything(),
          errorStack: expect.anything(),
          url: expect.anything(),
          userAgent: expect.anything(),
        }),
      );
    });
  });
});
