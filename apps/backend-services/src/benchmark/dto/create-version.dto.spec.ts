import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CreateVersionDto } from "./create-version.dto";

describe("CreateVersionDto", () => {
  it.each([
    "dataset-manifest.json",
    "manifests/v2/manifest.json",
  ])("accepts a relative manifestPath inside the dataset: %s", (manifestPath) => {
    const dto = plainToInstance(CreateVersionDto, { manifestPath });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it.each([
    "/data/manifest.json",
    "../other/manifest.json",
    "manifests/../../manifest.json",
    "manifests/..",
  ])("rejects a manifestPath outside the dataset: %s", (manifestPath) => {
    const dto = plainToInstance(CreateVersionDto, { manifestPath });
    const errors = validateSync(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe("manifestPath");
  });
});
