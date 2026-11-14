import { pollUntilSettled } from "./azure-poll-loop";

describe("pollUntilSettled", () => {
  it("returns the value once the poll settles", async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const poll = jest
      .fn()
      .mockResolvedValueOnce({ done: false })
      .mockResolvedValueOnce({ done: true, value: "ok" });

    await expect(
      pollUntilSettled(poll, {
        description: "x",
        pollIntervalSeconds: 1,
        sleep,
      }),
    ).resolves.toBe("ok");
    expect(poll).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("fails with a non-retryable error when the wait budget is exceeded", async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const poll = jest.fn().mockResolvedValue({ done: false });

    await expect(
      pollUntilSettled(poll, {
        description: "Azure to finish",
        pollIntervalSeconds: 10,
        maxWaitSeconds: 5,
        sleep,
      }),
    ).rejects.toMatchObject({
      nonRetryable: true,
      message: expect.stringContaining("Azure to finish"),
    });
  });

  it("propagates poll errors", async () => {
    const poll = jest.fn().mockRejectedValue(new Error("boom"));
    await expect(
      pollUntilSettled(poll, { description: "x", sleep: jest.fn() }),
    ).rejects.toThrow("boom");
  });
});
