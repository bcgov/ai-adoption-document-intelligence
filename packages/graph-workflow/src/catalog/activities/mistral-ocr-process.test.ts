import { mistralOcrProcessParametersSchema } from "./mistral-ocr-process";

describe("Mistral OCR parameters", () => {
  it.each([
    "native",
    "azure",
  ])("accepts persisted %s parameters without exposing a transport selector", (variant) => {
    const parsed = mistralOcrProcessParametersSchema.safeParse({ variant });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).not.toHaveProperty("variant");
  });
});
