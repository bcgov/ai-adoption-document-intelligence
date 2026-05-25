/**
 * Workflow-safe sha256 hex helper for the Phase 4 try-in-place cache.
 *
 * The Phase 4 cache layer (worker decorator + source-node cache write +
 * `computeInputHash`) is reached from Temporal workflow code, which
 * disallows Node-builtin modules like `crypto` (some module members —
 * e.g. `randomUUID` — are non-deterministic).
 *
 * `@noble/hashes/sha2` is a pure-JS sha256 implementation with no
 * Node-builtin imports — it only touches `globalThis.crypto` for
 * `getRandomValues` lookups that the deterministic `sha256(...)` path
 * doesn't use. That makes it safe to import from workflow code, the
 * worker, the backend, and the shared package's tests alike.
 */

import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

/**
 * Returns the hex sha256 digest of a UTF-8 string. Pure / deterministic.
 */
export function sha256Hex(input: string): string {
  return bytesToHex(sha256(utf8ToBytes(input)));
}
