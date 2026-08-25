import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { RevertHeadDto } from "./workflow-info.dto";

/**
 * The global ValidationPipe is configured with
 * `{ whitelist: true, forbidNonWhitelisted: true }` in `main.ts`. That means
 * every property on every incoming DTO must carry a class-validator decorator,
 * otherwise the pipe rejects the request with
 * `"property X should not exist"`. `@ApiProperty` is Swagger-only and does
 * NOT register the property with class-validator.
 *
 * These tests lock in that contract for the DTOs that don't already have
 * dedicated spec coverage.
 */
describe("RevertHeadDto whitelist contract", () => {
  it("accepts a body with workflowVersionId (class-validator sees the property)", async () => {
    const dto = plainToInstance(
      RevertHeadDto,
      { workflowVersionId: "wv-1" },
      { enableImplicitConversion: true },
    );

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual([]);
  });

  it("rejects an unknown property with forbidNonWhitelisted", async () => {
    const dto = plainToInstance(
      RevertHeadDto,
      { workflowVersionId: "wv-1", bogus: "no" },
      { enableImplicitConversion: true },
    );

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe("bogus");
  });

  it("rejects a body missing workflowVersionId", async () => {
    const dto = plainToInstance(
      RevertHeadDto,
      {},
      { enableImplicitConversion: true },
    );

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe("workflowVersionId");
  });
});
