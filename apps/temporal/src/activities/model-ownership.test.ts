import { ApplicationFailure } from "@temporalio/common";
import { getPrismaClient } from "./database-client";
import { assertModelUsableByGroup } from "./model-ownership";

jest.mock("./database-client", () => ({
  getPrismaClient: jest.fn(),
}));

const GROUP = "clh7z2xk00000356u8e3h1234";

describe("assertModelUsableByGroup", () => {
  const trainedModelFindFirst = jest.fn();
  const trainingJobFindFirst = jest.fn();

  beforeEach(() => {
    trainedModelFindFirst.mockReset().mockResolvedValue(null);
    trainingJobFindFirst.mockReset().mockResolvedValue(null);
    (getPrismaClient as jest.Mock).mockReturnValue({
      trainedModel: { findFirst: trainedModelFindFirst },
      trainingJob: { findFirst: trainingJobFindFirst },
    });
  });

  it("looks the lowercased id up exactly among other groups' trained models and in-flight training jobs", async () => {
    await assertModelUsableByGroup("Invoice-V2", GROUP);

    expect(trainedModelFindFirst).toHaveBeenCalledWith({
      where: {
        model_id: "invoice-v2",
        template_model: { group_id: { not: GROUP } },
      },
      select: { id: true },
    });
    expect(trainingJobFindFirst).toHaveBeenCalledWith({
      where: {
        target_model_id: "invoice-v2",
        status: { in: ["PENDING", "UPLOADING", "UPLOADED", "TRAINING"] },
        template_model: { group_id: { not: GROUP } },
      },
      select: { id: true },
    });
  });

  it("compares an id containing _ or % as written, not as a pattern", async () => {
    await assertModelUsableByGroup("Pay_Stub%", GROUP);

    expect(trainedModelFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ model_id: "pay_stub%" }),
      }),
    );
    expect(trainingJobFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ target_model_id: "pay_stub%" }),
      }),
    );
  });

  it.each([
    "invoice-v2",
    "prebuilt-layout",
    "external-model",
  ])("allows a model no other group trained or is training: %s", async (modelId) => {
    await expect(
      assertModelUsableByGroup(modelId, GROUP),
    ).resolves.toBeUndefined();
  });

  it("refuses another group's trained model as not found, without retries", async () => {
    trainedModelFindFirst.mockResolvedValue({ id: "trained-other-group" });

    const failure = await assertModelUsableByGroup("invoice-v2", GROUP).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApplicationFailure);
    expect((failure as ApplicationFailure).message).toBe(
      "Model not found: invoice-v2",
    );
    expect((failure as ApplicationFailure).nonRetryable).toBe(true);
  });

  it("refuses a model another group is still training", async () => {
    trainingJobFindFirst.mockResolvedValue({ id: "job-other-group" });

    await expect(assertModelUsableByGroup("invoice-v3", GROUP)).rejects.toThrow(
      "Model not found: invoice-v3",
    );
  });

  it("checks an id that starts with prebuilt- like any other", async () => {
    trainedModelFindFirst.mockResolvedValue({ id: "trained-other-group" });

    await expect(
      assertModelUsableByGroup("prebuilt-v2", GROUP),
    ).rejects.toThrow("Model not found: prebuilt-v2");
  });

  it.each([
    "invoice-v2",
    "prebuilt-layout",
  ])("refuses to look up %s without a groupId", async (modelId) => {
    await expect(assertModelUsableByGroup(modelId, undefined)).rejects.toThrow(
      `groupId is required to use model ${modelId}`,
    );
    expect(trainedModelFindFirst).not.toHaveBeenCalled();
    expect(trainingJobFindFirst).not.toHaveBeenCalled();
  });
});
