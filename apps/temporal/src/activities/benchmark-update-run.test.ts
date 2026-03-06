/**
 * Tests for Benchmark Run Status Update Activity
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-022-benchmark-run-workflow.md
 */

import { benchmarkUpdateRunStatus, BenchmarkUpdateRunStatusInput } from './benchmark-update-run';
import { getPrismaClient } from './database-client';

jest.mock('./database-client', () => ({
  getPrismaClient: jest.fn(),
}));

const getPrismaClientMock = getPrismaClient as jest.Mock;

describe('benchmarkUpdateRunStatus', () => {
  let prismaMock: {
    benchmarkRun: {
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prismaMock = {
      benchmarkRun: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    getPrismaClientMock.mockReturnValue(prismaMock);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should update run status to running and set startedAt', async () => {
    const input: BenchmarkUpdateRunStatusInput = {
      runId: 'run-1',
      status: 'running',
    };

    await benchmarkUpdateRunStatus(input);

    expect(prismaMock.benchmarkRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({
        status: 'running',
        startedAt: expect.any(Date),
      }),
    });
  });

  it('should update run status to completed with metrics', async () => {
    const input: BenchmarkUpdateRunStatusInput = {
      runId: 'run-1',
      status: 'completed',
      metrics: { f1: 0.95, precision: 0.9 },
      completedAt: new Date('2026-01-01T00:00:00Z'),
    };

    await benchmarkUpdateRunStatus(input);

    expect(prismaMock.benchmarkRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({
        status: 'completed',
        metrics: { f1: 0.95, precision: 0.9 },
        completedAt: new Date('2026-01-01T00:00:00Z'),
      }),
    });
  });

  it('should update run status to failed with error message', async () => {
    const input: BenchmarkUpdateRunStatusInput = {
      runId: 'run-1',
      status: 'failed',
      error: 'Dataset not found',
      completedAt: new Date('2026-01-01T00:00:00Z'),
    };

    await benchmarkUpdateRunStatus(input);

    expect(prismaMock.benchmarkRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({
        status: 'failed',
        error: 'Dataset not found',
        completedAt: new Date('2026-01-01T00:00:00Z'),
      }),
    });
  });

  it('should not set startedAt for non-running statuses', async () => {
    const input: BenchmarkUpdateRunStatusInput = {
      runId: 'run-1',
      status: 'completed',
    };

    await benchmarkUpdateRunStatus(input);

    const updateCall = prismaMock.benchmarkRun.update.mock.calls[0][0];
    expect(updateCall.data.startedAt).toBeUndefined();
  });

  it('should not include optional fields when not provided', async () => {
    const input: BenchmarkUpdateRunStatusInput = {
      runId: 'run-1',
      status: 'pending',
    };

    await benchmarkUpdateRunStatus(input);

    const updateCall = prismaMock.benchmarkRun.update.mock.calls[0][0];
    expect(updateCall.data.metrics).toBeUndefined();
    expect(updateCall.data.error).toBeUndefined();
    expect(updateCall.data.completedAt).toBeUndefined();
  });

  it('should update run status to cancelled', async () => {
    const input: BenchmarkUpdateRunStatusInput = {
      runId: 'run-1',
      status: 'cancelled',
      completedAt: new Date('2026-01-01T00:00:00Z'),
    };

    await benchmarkUpdateRunStatus(input);

    expect(prismaMock.benchmarkRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({
        status: 'cancelled',
        completedAt: new Date('2026-01-01T00:00:00Z'),
      }),
    });
  });
});
