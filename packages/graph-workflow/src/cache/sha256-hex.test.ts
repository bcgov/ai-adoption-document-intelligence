import { describe, expect, it } from "@jest/globals";
import { sha256Hex } from "./sha256-hex";

/**
 * Vectors cross-checked against Node's `crypto.createHash("sha256")` (UTF-8).
 * The multibyte cases are the regression guard: `sha256Hex` must UTF-8 encode
 * WITHOUT `TextEncoder` (absent in the Temporal workflow sandbox), so a
 * hand-rolled encoder handles 1–4 byte sequences incl. astral/emoji code
 * points. A byte-length bug in that encoder would change these digests.
 */
describe("sha256Hex", () => {
  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    [
      "hello",
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    ],
    // 2-byte (é) sequence.
    ["café", "850f7dc43910ff890f8879c0ed26fe697c93a067ad93a7d50f466a7028a9bf4e"],
    // 3-byte (CJK) + 4-byte (emoji, surrogate pair) sequences.
    [
      "日本語 😀",
      "fde211ca1a740f4758ae554eb97eca48c2aa74cdf8b656adfa31266d72b6106c",
    ],
  ])("hashes %j to the known digest", (input, expected) => {
    expect(sha256Hex(input)).toBe(expected);
  });

  it("is deterministic and returns 64 hex chars", () => {
    const a = sha256Hex('{"config":"x","input":[1,2,3]}');
    const b = sha256Hex('{"config":"x","input":[1,2,3]}');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("distinguishes inputs that differ only in non-ASCII bytes", () => {
    expect(sha256Hex("café")).not.toBe(sha256Hex("cafe"));
  });
});
