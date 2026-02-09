import { executeWithConcurrencyLimit, parseDurationToMs } from './runner-utils';

describe('executeWithConcurrencyLimit', () => {
  it('should execute all items', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await executeWithConcurrencyLimit(
      items,
      2,
      async (item) => item * 2,
    );

    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('should preserve order of results', async () => {
    const items = [1, 2, 3, 4, 5];
    const delays = [50, 10, 30, 5, 20];

    const results = await executeWithConcurrencyLimit(
      items,
      3,
      async (item, index) => {
        await new Promise((resolve) => setTimeout(resolve, delays[index]));
        return item * 2;
      },
    );

    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('should limit concurrency', async () => {
    const items = [1, 2, 3, 4, 5];
    let currentConcurrency = 0;
    let maxObservedConcurrency = 0;

    await executeWithConcurrencyLimit(items, 2, async () => {
      currentConcurrency++;
      maxObservedConcurrency = Math.max(maxObservedConcurrency, currentConcurrency);
      await new Promise((resolve) => setTimeout(resolve, 10));
      currentConcurrency--;
    });

    expect(maxObservedConcurrency).toBeLessThanOrEqual(2);
  });

  it('should handle empty array', async () => {
    const results = await executeWithConcurrencyLimit([], 2, async (item) => item);
    expect(results).toEqual([]);
  });

  it('should handle single item', async () => {
    const results = await executeWithConcurrencyLimit([42], 2, async (item) => item * 2);
    expect(results).toEqual([84]);
  });

  it('should handle concurrency limit greater than items', async () => {
    const items = [1, 2, 3];
    const results = await executeWithConcurrencyLimit(
      items,
      10,
      async (item) => item * 2,
    );

    expect(results).toEqual([2, 4, 6]);
  });
});

describe('parseDurationToMs', () => {
  it('should parse milliseconds', () => {
    expect(parseDurationToMs('100ms')).toBe(100);
    expect(parseDurationToMs('500ms')).toBe(500);
  });

  it('should parse seconds', () => {
    expect(parseDurationToMs('1s')).toBe(1000);
    expect(parseDurationToMs('5s')).toBe(5000);
    expect(parseDurationToMs('30s')).toBe(30000);
  });

  it('should parse minutes', () => {
    expect(parseDurationToMs('1m')).toBe(60000);
    expect(parseDurationToMs('5m')).toBe(300000);
  });

  it('should parse hours', () => {
    expect(parseDurationToMs('1h')).toBe(3600000);
    expect(parseDurationToMs('2h')).toBe(7200000);
  });

  it('should parse days', () => {
    expect(parseDurationToMs('1d')).toBe(86400000);
    expect(parseDurationToMs('2d')).toBe(172800000);
  });

  it('should handle decimal values', () => {
    expect(parseDurationToMs('1.5s')).toBe(1500);
    expect(parseDurationToMs('0.5m')).toBe(30000);
  });

  it('should handle whitespace', () => {
    expect(parseDurationToMs('  1s  ')).toBe(1000);
    expect(parseDurationToMs('5m ')).toBe(300000);
  });

  it('should be case insensitive', () => {
    expect(parseDurationToMs('1S')).toBe(1000);
    expect(parseDurationToMs('5M')).toBe(300000);
  });

  it('should throw on invalid format', () => {
    expect(() => parseDurationToMs('invalid')).toThrow('Invalid duration string');
    expect(() => parseDurationToMs('100')).toThrow('Invalid duration string');
    expect(() => parseDurationToMs('s100')).toThrow('Invalid duration string');
  });

  it('should throw on invalid unit', () => {
    expect(() => parseDurationToMs('100x')).toThrow('Invalid duration string');
  });
});
