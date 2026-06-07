import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  AgentChatRequestDto,
  MAX_CHAT_MESSAGES,
} from "./agent-chat-request.dto";

// Validates the chat request DTO in isolation (no AgentService / AI SDK
// import — that graph OOMs ts-jest's type-checker). The global ValidationPipe
// runs exactly these class-validator constraints at the controller boundary.
describe("AgentChatRequestDto", () => {
  const make = (partial: Record<string, unknown>) =>
    plainToInstance(AgentChatRequestDto, partial);

  it("accepts a minimal valid body", async () => {
    expect(
      await validate(make({ messages: [{ role: "user", parts: [] }] })),
    ).toEqual([]);
  });

  it("requires `messages` to be present", async () => {
    const errors = await validate(make({}));
    expect(errors.map((e) => e.property)).toContain("messages");
  });

  it("rejects `messages` that is not an array", async () => {
    const errors = await validate(make({ messages: "nope" }));
    expect(errors.map((e) => e.property)).toContain("messages");
  });

  it("rejects more than MAX_CHAT_MESSAGES messages", async () => {
    const messages = Array.from({ length: MAX_CHAT_MESSAGES + 1 }, () => ({
      role: "user",
    }));
    const errors = await validate(make({ messages }));
    expect(errors.map((e) => e.property)).toContain("messages");
  });

  it("rejects array elements that are not objects", async () => {
    const errors = await validate(make({ messages: ["not-an-object"] }));
    expect(errors.map((e) => e.property)).toContain("messages");
  });

  it("rejects an unknown provider", async () => {
    const errors = await validate(make({ messages: [{}], provider: "openai" }));
    expect(errors.map((e) => e.property)).toContain("provider");
  });

  it("accepts the known providers", async () => {
    for (const provider of ["anthropic", "azure"]) {
      expect(await validate(make({ messages: [{}], provider }))).toEqual([]);
    }
  });

  it("rejects an over-long model override", async () => {
    const errors = await validate(
      make({ messages: [{}], model: "x".repeat(201) }),
    );
    expect(errors.map((e) => e.property)).toContain("model");
  });
});
