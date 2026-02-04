import { LLMClient } from "../client/llmClient.js";
import { StreamEventType, TokenUsage } from "../client/response.js";
import { ContextManager } from "./manager.js";
import { getCompressionPrompt } from "../prompts/system.js";

export class ChatCompactor {
  private client: LLMClient;

  constructor(client: LLMClient) {
    this.client = client;
  }

  private formatHistory(messages: Array<Record<string, any>>): string {
    const output: string[] = ["Here is the conversation that needs to be continue: \n"]; // matches python typo

    for (const message of messages) {
      const role = message.role ?? "";
      const content = message.content ?? "";

      if (role === "system") {
        continue;
      }

      if (role === "tool") {
        const toolId = message.tool_call_id ?? "unknown";
        let truncated = content.slice(0, 2000);
        if (content.length > 2000) {
          truncated += "\n... [tool output truncated]";
        }
        output.push(`[Tool Result (${toolId})]:\n${truncated}`);
        continue;
      }

      if (role === "assistant") {
        if (content) {
          let truncated = content.slice(0, 3000);
          if (content.length > 3000) {
            truncated += "\n... [response truncated]";
          }
          output.push(`Assistant:\n${truncated}`);
        }

        if (message.tool_calls) {
          const toolDetails: string[] = [];
          for (const toolCall of message.tool_calls) {
            const func = toolCall.function ?? {};
            const name = func.name ?? "unknown";
            let args = func.arguments ?? "{}";
            if (args.length > 500) {
              args = args.slice(0, 500);
            }
            toolDetails.push(`  - ${name}(${args})`);
          }
          output.push(`Assistant called tools:\n${toolDetails.join("\n")}`);
        }
        continue;
      }

      let truncated = content.slice(0, 1500);
      if (content.length > 1500) {
        truncated += "\n... [message truncated]";
      }
      output.push(`User:\n${truncated}`);
    }

    return output.join("\n\n---\n\n");
  }

  async compress(contextManager: ContextManager): Promise<{ summary: string | null; usage: TokenUsage | null }> {
    const messages = contextManager.getMessages();
    if (messages.length < 3) {
      return { summary: null, usage: null };
    }

    const compressionMessages = [
      { role: "system", content: getCompressionPrompt() },
      { role: "user", content: this.formatHistory(messages) },
    ];

    try {
      let summary = "";
      let usage: TokenUsage | null = null;

      for await (const event of this.client.chatCompletion(compressionMessages, undefined, false)) {
        if (event.type === StreamEventType.MESSAGE_COMPLETE) {
          usage = event.usage ?? null;
          if (event.textDelta?.content) {
            summary += event.textDelta.content;
          }
        }
      }

      if (!summary || !usage) {
        return { summary: null, usage: null };
      }

      return { summary, usage };
    } catch (error) {
      return { summary: null, usage: null };
    }
  }
}
