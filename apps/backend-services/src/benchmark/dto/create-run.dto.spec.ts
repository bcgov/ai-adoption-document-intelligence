import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CreateRunDto } from "./create-run.dto";

describe("CreateRunDto", () => {
  it("accepts a cuid-shaped candidateWorkflowVersionId (workflow_versions.id)", () => {
    const dto = plainToInstance(CreateRunDto, {
      candidateWorkflowVersionId: "clh0rk7p0000lmd9v8l3a2z9",
    });
    const errors = validateSync(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts a UUID-shaped ocrCacheBaselineRunId (benchmark_runs.id)", () => {
    const dto = plainToInstance(CreateRunDto, {
      ocrCacheBaselineRunId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    });
    const errors = validateSync(dto);
    expect(errors).toHaveLength(0);
  });
});
