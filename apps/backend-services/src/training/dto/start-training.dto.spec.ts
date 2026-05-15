import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { StartTrainingDto } from "./start-training.dto";

describe("StartTrainingDto", () => {
  it("accepts maxTrainingHours at the Azure free-tier ceiling of 10", () => {
    const dto = plainToInstance(StartTrainingDto, {
      buildMode: "neural",
      maxTrainingHours: 10,
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it("rejects maxTrainingHours above 10", () => {
    const dto = plainToInstance(StartTrainingDto, {
      buildMode: "neural",
      maxTrainingHours: 10.5,
    });
    const errors = validateSync(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty("max");
  });

  it("rejects maxTrainingHours below the Azure billing floor of 0.5", () => {
    const dto = plainToInstance(StartTrainingDto, {
      buildMode: "neural",
      maxTrainingHours: 0.25,
    });
    const errors = validateSync(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty("min");
  });
});
