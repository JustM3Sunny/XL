import { Config } from "../config/config.js";
import { TokenUsage, addUsage } from "../client/response.js";
import { getSystemPrompt } from "../prompts/system.js";
import { countTokens } from "../utils/text.js";
import { Tool } from "../tools/base.js";

export interface MessageItem {
  role: string;
  content: string;
  toolCallId?: string;
  toolCalls?: Array<Record<string, any>>;
  tokenCount?: number;
  prunedAt?: Date;
}

export class ContextManager {
  static PRUNE_PROTECT_TOKENS = 40_000;
  static PRUNE_MINIMUM_TOKENS = 20_000;

  private systemPrompt: string;
  private modelName: string;
  private messages: MessageItem[] = [];
  private latestUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
  };
  totalUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
  };

  constructor(config: Config, userMemory: string | null, tools: Tool[] | null) {
    this.systemPrompt = getSystemPrompt(config, userMemory, tools ?? undefined);
    this.modelName = config.modelName;
  }

  get messageCount(): number {
    return this.messages.length;
  }

  addUserMessage(content: string): void {
    this.messages.push({
      role: "user",
      content,
      tokenCount: countTokens(content, this.modelName),
    });
  }

  addAssistantMessage(content?: string | null, toolCalls?: Array<Record<string, any>> | null): void {
    const text = content ?? "";
    this.messages.push({
      role: "assistant",
      content: text,
      tokenCount: countTokens(text, this.modelName),
      toolCalls: toolCalls ?? [],
    });
  }

  addToolResult(toolCallId: string, content: string): void {
    this.messages.push({
      role: "tool",
      content,
      toolCallId,
      tokenCount: countTokens(content, this.modelName),
    });
  }

  getMessages(): Array<Record<string, any>> {
    const output: Array<Record<string, any>> = [];

    if (this.systemPrompt) {
      output.push({ role: "system", content: this.systemPrompt });
    }

    for (const item of this.messages) {
      const payload: Record<string, any> = { role: item.role };
      if (item.toolCallId) {
        payload.tool_call_id = item.toolCallId;
      }
      if (item.toolCalls && item.toolCalls.length > 0) {
        payload.tool_calls = item.toolCalls;
      }
      if (item.content) {
        payload.content = item.content;
      }
      output.push(payload);
    }

    return output;
  }

  needsCompression(contextWindow: number): boolean {
    const currentTokens = this.latestUsage.totalTokens;
    return currentTokens > contextWindow * 0.8;
  }

  setLatestUsage(usage: TokenUsage): void {
    this.latestUsage = usage;
  }

  addUsage(usage: TokenUsage): void {
    this.totalUsage = addUsage(this.totalUsage, usage);
  }

  replaceWithSummary(summary: string): void {
    this.messages = [];

    const continuationContent = `# Context Restoration (Previous Session Compacted)\n\nThe previous conversation was compacted due to context length limits. Below is a detailed summary of the work done so far.\n\n**CRITICAL: Actions listed under \"COMPLETED ACTIONS\" are already done. DO NOT repeat them.**\n\n---\n\n${summary}\n\n---\n\nResume work from where we left off. Focus ONLY on the remaining tasks.`;
    this.messages.push({
      role: "user",
      content: continuationContent,
      tokenCount: countTokens(continuationContent, this.modelName),
    });

    const ackContent = `I've reviewed the context from the previous session. I understand:\n- The original goal and what was requested\n- Which actions are ALREADY COMPLETED (I will NOT repeat these)\n- The current state of the project\n- What still needs to be done\n\nI'll continue with the REMAINING tasks only, starting from where we left off.`;
    this.messages.push({
      role: "assistant",
      content: ackContent,
      tokenCount: countTokens(ackContent, this.modelName),
    });

    const continueContent =
      "Continue with the REMAINING work only. Do NOT repeat any completed actions. Proceed with the next step as described in the context above.";
    this.messages.push({
      role: "user",
      content: continueContent,
      tokenCount: countTokens(continueContent, this.modelName),
    });
  }

  pruneToolOutputs(): number {
    const userMessageCount = this.messages.filter((msg) => msg.role === "user").length;
    if (userMessageCount < 2) {
      return 0;
    }

    let totalTokens = 0;
    let prunedTokens = 0;
    const toPrune: MessageItem[] = [];

    for (const msg of [...this.messages].reverse()) {
      if (msg.role === "tool" && msg.toolCallId) {
        if (msg.prunedAt) {
          break;
        }

        const tokens = msg.tokenCount ?? countTokens(msg.content, this.modelName);
        totalTokens += tokens;

        if (totalTokens > ContextManager.PRUNE_PROTECT_TOKENS) {
          prunedTokens += tokens;
          toPrune.push(msg);
        }
      }
    }

    if (prunedTokens < ContextManager.PRUNE_MINIMUM_TOKENS) {
      return 0;
    }

    let prunedCount = 0;
    for (const msg of toPrune) {
      msg.content = "[Old tool result content cleared]";
      msg.tokenCount = countTokens(msg.content, this.modelName);
      msg.prunedAt = new Date();
      prunedCount += 1;
    }

    return prunedCount;
  }

  clear(): void {
    this.messages = [];
  }
}
