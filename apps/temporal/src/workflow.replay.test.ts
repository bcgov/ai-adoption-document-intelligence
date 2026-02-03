/**
 * Replay test: verifies the workflow is deterministic by replaying a recorded history.
 * Fails on DeterminismViolationError or ReplayError if workflow code changed in a non-deterministic way.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Worker } from '@temporalio/worker';

const FIXTURE_PATH = path.join(__dirname, '__fixtures__', 'ocr-workflow-history.json');

/**
 * Convert Timestamp and Duration objects to proto3 JSON strings so historyFromJSON accepts the history.
 */
function historyToProto3JSON(obj: unknown, key?: string): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj === 'object' && obj !== null && 'seconds' in obj) {
    const ts = obj as { seconds: string | number; nanos?: number };
    const sec = typeof ts.seconds === 'string' ? parseInt(ts.seconds, 10) : ts.seconds;
    const nanos = ts.nanos ?? 0;
    const keyLower = (key ?? '').toLowerCase();
    const isDuration =
      keyLower.includes('timeout') ||
      keyLower.includes('duration') ||
      keyLower.includes('backoff') ||
      keyLower.includes('interval') ||
      keyLower === 'firstworkflowtaskbackoff';
    if (isDuration) {
      const durationSec = sec + nanos / 1e9;
      return `${durationSec}s`;
    }
    const ms = sec * 1000 + nanos / 1e6;
    return new Date(ms).toISOString();
  }
  const keyLower = (key ?? '').toLowerCase();
  const isDurationKey =
    keyLower.includes('timeout') ||
    keyLower.includes('duration') ||
    keyLower.includes('backoff');
  if (
    isDurationKey &&
    typeof obj === 'object' &&
    obj !== null &&
    Object.keys(obj).length === 0
  ) {
    return '0s';
  }
  if (Array.isArray(obj)) {
    return obj.map((v) => historyToProto3JSON(v));
  }
  if (typeof obj === 'object' && obj !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = historyToProto3JSON(v, k);
    }
    return out;
  }
  return obj;
}

describe('OCR workflow replay (durable execution)', () => {
  it('replays recorded history without determinism violation', async () => {
    const historyJson = fs.readFileSync(FIXTURE_PATH, 'utf8');
    const historyRaw = JSON.parse(historyJson);
    const history = historyToProto3JSON(historyRaw) as { events: unknown[] };

    const workflowsPath = require.resolve('./workflow');

    await expect(
      Worker.runReplayHistory(
        {
          workflowsPath,
        },
        history
      )
    ).resolves.toBeUndefined();
  });
});
