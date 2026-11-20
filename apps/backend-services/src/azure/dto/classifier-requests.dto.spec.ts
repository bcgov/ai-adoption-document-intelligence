import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { ClassifierSource } from "@/azure/dto/classifier-constants.dto";
import {
  ClassifierCreationDto,
  DeleteClassifierDocumentsDto,
  GetClassifierDocumentsQueryDto,
  RequestClassifierTrainingDto,
  UploadClassifierDocumentsDto,
} from "@/azure/dto/classifier-requests.dto";

const GROUP_ID = "clh7z2xk00000356u8e3h1234";

const DOT_SEGMENT_VALUES = [".", "..", "../c1", "c1/..", "c1/../c2", "c1/./c2"];

const ACCEPTED_VALUES = [
  "c1",
  "Invoice Classifier",
  "v1.2",
  ".hidden",
  "name.",
  "a..b",
  "...",
  "c1/l1",
];

/** Validates `plain` as `dto` and returns the names of the failing properties. */
function failingProperties<T extends object>(
  dto: new () => T,
  plain: Record<string, unknown>,
): string[] {
  return validateSync(plainToInstance(dto, plain)).map((e) => e.property);
}

describe("classifier request DTOs: blob path components", () => {
  const cases: Array<{
    dto: new () => object;
    field: string;
    base: Record<string, unknown>;
  }> = [
    {
      dto: ClassifierCreationDto,
      field: "name",
      base: {
        name: "c1",
        description: "d",
        source: ClassifierSource.AZURE,
        group_id: GROUP_ID,
      },
    },
    {
      dto: UploadClassifierDocumentsDto,
      field: "name",
      base: { name: "c1", label: "l1" },
    },
    {
      dto: UploadClassifierDocumentsDto,
      field: "label",
      base: { name: "c1", label: "l1" },
    },
    {
      dto: GetClassifierDocumentsQueryDto,
      field: "name",
      base: { name: "c1", group_id: GROUP_ID },
    },
    {
      dto: DeleteClassifierDocumentsDto,
      field: "name",
      base: { name: "c1", group_id: GROUP_ID },
    },
    {
      dto: DeleteClassifierDocumentsDto,
      field: "folder",
      base: { name: "c1", group_id: GROUP_ID, folder: "l1" },
    },
    {
      dto: RequestClassifierTrainingDto,
      field: "name",
      base: { name: "c1", group_id: GROUP_ID },
    },
  ];

  describe.each(cases)("$dto.name.$field", ({ dto, field, base }) => {
    it.each(
      DOT_SEGMENT_VALUES,
    )("rejects a value with a dot segment: %s", (value) => {
      expect(failingProperties(dto, { ...base, [field]: value })).toEqual([
        field,
      ]);
    });

    it.each(
      ACCEPTED_VALUES,
    )("accepts a value without a dot segment: %s", (value) => {
      expect(failingProperties(dto, { ...base, [field]: value })).toEqual([]);
    });
  });

  it("answers a dot-segment folder with 400 through the application's validation pipe", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });

    await expect(
      pipe.transform(
        { name: "c1", group_id: GROUP_ID, folder: ".." },
        { type: "query", metatype: DeleteClassifierDocumentsDto },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("answers a dot-segment label with 400 through the application's validation pipe", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });

    await expect(
      pipe.transform(
        { name: "c1", label: "../l1" },
        { type: "body", metatype: UploadClassifierDocumentsDto },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
