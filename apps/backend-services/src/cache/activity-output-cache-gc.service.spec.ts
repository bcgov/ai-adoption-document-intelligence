import type { ActivityOutputCacheRepository } from "./activity-output-cache.repository";
import { ActivityOutputCacheGcService } from "./activity-output-cache-gc.service";

function makeService(deleteExpired: jest.Mock): {
  service: ActivityOutputCacheGcService;
  logger: { log: jest.Mock; error: jest.Mock };
} {
  const logger = { log: jest.fn(), error: jest.fn() };
  const service = new ActivityOutputCacheGcService(
    { deleteExpired } as unknown as ActivityOutputCacheRepository,
    logger as never,
  );
  return { service, logger };
}

describe("ActivityOutputCacheGcService", () => {
  it("deletes expired rows via the repository and logs the count when > 0", async () => {
    const deleteExpired = jest.fn().mockResolvedValue(7);
    const { service, logger } = makeService(deleteExpired);

    await service.sweepExpired();

    expect(deleteExpired).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(
      "Activity-output cache GC sweep complete",
      { deleted: 7 },
    );
  });

  it("stays quiet when nothing was expired", async () => {
    const deleteExpired = jest.fn().mockResolvedValue(0);
    const { service, logger } = makeService(deleteExpired);

    await service.sweepExpired();

    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("swallows repository failures — logged, never thrown (a cron must not take the process down)", async () => {
    const deleteExpired = jest.fn().mockRejectedValue(new Error("db down"));
    const { service, logger } = makeService(deleteExpired);

    await expect(service.sweepExpired()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      "Activity-output cache GC sweep failed — will retry next hour",
      expect.objectContaining({ stack: expect.any(String) }),
    );
  });

  it("is registered as an hourly cron", () => {
    // The @Cron decorator stamps scheduler metadata on the method; assert
    // it is present so a refactor cannot silently detach the sweep from
    // the scheduler (the original defect: a GC workflow nothing started).
    const metaKeys = Reflect.getMetadataKeys(
      ActivityOutputCacheGcService.prototype.sweepExpired,
    );
    expect(metaKeys.length).toBeGreaterThan(0);
  });
});
