import { expect, Locator, Page } from "@playwright/test";

/**
 * Page Object for the AI agent chat drawer (assistant-ui runtime).
 * Opened from the global `agent-chat-icon`.
 */
export class AgentChatPage {
  readonly page: Page;
  readonly icon: Locator;
  readonly drawer: Locator;
  readonly textarea: Locator;
  readonly send: Locator;
  readonly abort: Locator;
  readonly reset: Locator;
  readonly close: Locator;
  readonly thread: Locator;
  readonly modelPicker: Locator;
  readonly fileInput: Locator;
  readonly attachment: Locator;

  constructor(page: Page) {
    this.page = page;
    this.icon = page.getByTestId("agent-chat-icon");
    this.drawer = page.getByTestId("agent-chat-drawer");
    this.textarea = page.getByTestId("agent-chat-textarea");
    this.send = page.getByTestId("agent-chat-send");
    this.abort = page.getByTestId("agent-chat-abort");
    this.reset = page.getByTestId("agent-chat-reset");
    this.close = page.getByTestId("agent-chat-close");
    this.thread = page.getByTestId("agent-chat-thread");
    this.modelPicker = page.getByTestId("agent-chat-model-picker");
    this.fileInput = page.getByTestId("agent-chat-file-input");
    this.attachment = page.getByTestId("agent-chat-attachment");
  }

  async open(): Promise<void> {
    await this.icon.click();
    await this.textarea.waitFor({ state: "visible" });
  }

  async sendPrompt(prompt: string): Promise<void> {
    await this.textarea.click();
    await this.textarea.fill(prompt);
    await this.page.keyboard.press("Enter");
  }

  /** A tool-call chip rendered in the thread, e.g. toolName="createWorkflow". */
  toolCall(toolName: string): Locator {
    return this.page.getByTestId(`agent-tool-call-${toolName}`);
  }

  /** Wait for the streamed assistant text to settle (length stable). */
  async waitForResponseSettled(timeoutMs = 30_000): Promise<string> {
    let last = -1;
    let stable = 0;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.page.waitForTimeout(400);
      const text = (await this.thread.innerText().catch(() => "")) ?? "";
      if (text.length === last) {
        stable++;
        if (stable >= 3 && text.length > 0) return text;
      } else {
        stable = 0;
        last = text.length;
      }
    }
    return (await this.thread.innerText().catch(() => "")) ?? "";
  }

  async expectThreadContains(substring: string): Promise<void> {
    await expect(this.thread).toContainText(substring, { timeout: 15_000 });
  }
}
