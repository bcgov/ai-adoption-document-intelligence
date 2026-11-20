import { ValidationPipe } from "@nestjs/common";
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

/**
 * The AI SDK's `DefaultChatTransport` puts its own envelope fields — `id` and
 * `trigger` — alongside our payload. The global pipe runs with
 * `forbidNonWhitelisted: true`, so an undeclared property is a hard 400 and
 * EVERY message from the chat drawer fails:
 *
 *   400 {"message":["property id should not exist",
 *                   "property trigger should not exist"]}
 *
 * class-validator alone cannot see this — whitelisting is a ValidationPipe
 * concern — so this block goes through the pipe exactly as the controller does.
 */
describe("AgentChatRequestDto — transport envelope fields (whitelisted pipe)", () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const meta = {
    type: "body" as const,
    metatype: AgentChatRequestDto,
    data: "",
  };
  const body = (extra: Record<string, unknown>) => ({
    groupId: "g-1",
    provider: "azure",
    model: "gpt-5.4",
    messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
    ...extra,
  });

  it("accepts the transport's `id` and `trigger`", async () => {
    await expect(
      pipe.transform(
        body({ id: "__LOCALID_abc", trigger: "submit-message" }),
        meta,
      ),
    ).resolves.toBeDefined();
  });

  it("still refuses a genuinely unknown property", async () => {
    // Nest carries the detail on the exception's response payload, not on
    // `.message`, so read it rather than regexing the Error.
    const err = await pipe
      .transform(body({ definitelyNotOurs: true }), meta)
      .then(
        () => null,
        (e: { getResponse?: () => unknown }) => e,
      );
    expect(err).not.toBeNull();
    const detail = JSON.stringify(err?.getResponse?.() ?? err);
    expect(detail).toContain("definitelyNotOurs");
  });
});
