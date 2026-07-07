import { computeContentHash } from "./content-hash.util";

describe("computeContentHash", () => {
  it("returns a stable SHA-256 hex digest", () => {
    const buffer = Buffer.from("hello");
    expect(computeContentHash(buffer)).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("differs for different content", () => {
    const a = computeContentHash(Buffer.from("file-a"));
    const b = computeContentHash(Buffer.from("file-b"));
    expect(a).not.toBe(b);
  });
});
