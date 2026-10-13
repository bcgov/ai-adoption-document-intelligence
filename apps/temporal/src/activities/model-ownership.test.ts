import { ApplicationFailure } from "@temporalio/common";
import { getPrismaClient } from "./database-client";
import { assertModelUsableByGroup } from "./model-ownership";

jest.mock("./database-client", () => ({
  getPrismaClient: jest.fn(),
}));

const GROUP = "clh7z2xk00000356u8e3h1234";
const OTHER_GROUP = "clh7z2xk00000356u8e3h5678";

describe("assertModelUsableByGroup", () => {
  const findUnique = jest.fn();

  beforeEach(() => {
    findUnique.mockReset();
    (getPrismaClient as jest.Mock).mockReturnValue({
      trainedModel: { findUnique },
    });
  });

  it("allows a prebuilt model without a database lookup", async () => {
    await expect(
      assertModelUsableByGroup("prebuilt-layout", GROUP),
    ).resolves.toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("allows a trained model that belongs to the run's group", async () => {
    findUnique.mockResolvedValue({ template_model: { group_id: GROUP } });

    await expect(
      assertModelUsableByGroup("invoice-v2", GROUP),
    ).resolves.toBeUndefined();
    expect(findUnique).toHaveBeenCalledWith({
      where: { model_id: "invoice-v2" },
      select: { template_model: { select: { group_id: true } } },
    });
  });

  it("refuses another group's trained model as not found, without retries", async () => {
    findUnique.mockResolvedValue({ template_model: { group_id: OTHER_GROUP } });

    const failure = await assertModelUsableByGroup("invoice-v2", GROUP).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApplicationFailure);
    expect((failure as ApplicationFailure).message).toBe(
      "Model not found: invoice-v2",
    );
    expect((failure as ApplicationFailure).nonRetryable).toBe(true);
  });

  it("allows a model id that no trained model records", async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      assertModelUsableByGroup("external-model", GROUP),
    ).resolves.toBeUndefined();
  });

  it("refuses a custom model without a groupId", async () => {
    await expect(
      assertModelUsableByGroup("invoice-v2", undefined),
    ).rejects.toThrow(/groupId is required/);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
