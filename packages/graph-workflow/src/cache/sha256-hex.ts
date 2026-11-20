/**
 * Workflow-safe sha256 hex helper for the Phase 4 try-in-place cache.
 *
 * The Phase 4 cache layer (worker decorator + source-node cache write +
 * `computeInputHash`) is reached from Temporal workflow code, which
 * disallows Node-builtin modules like `crypto` (some module members —
 * e.g. `randomUUID` — are non-deterministic).
 *
 * `@noble/hashes/sha2` is a pure-JS sha256 implementation with no
 * Node-builtin imports, so the digest itself is workflow-safe. Its
 * `utf8ToBytes` helper, however, constructs a `TextEncoder` — which is NOT a
 * global in the Temporal workflow sandbox — so importing it broke the
 * workflow-safe contract with `ReferenceError: TextEncoder is not defined`
 * (thrown from the source-node cache hash, failing the whole workflow task).
 * We UTF-8 encode with the hand-rolled {@link utf8ToBytes} below, which has no
 * ambient dependencies, keeping this safe to import from workflow code, the
 * worker, the backend, and the shared package's tests alike.
 */

import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";

/**
 * UTF-8 encode a string to bytes without `TextEncoder` (see file header for
 * why the sandbox forbids it). Handles the full BMP plus astral code points
 * via surrogate-pair combination. Byte-for-byte identical to
 * `new TextEncoder().encode(input)`.
 */
function utf8ToBytes(input: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate — combine with the following low surrogate into a
      // single astral code point, then emit its 4-byte sequence.
      const low = input.charCodeAt(++i);
      code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

/**
 * Returns the hex sha256 digest of a UTF-8 string. Pure / deterministic.
 */
export function sha256Hex(input: string): string {
  return bytesToHex(sha256(utf8ToBytes(input)));
}
