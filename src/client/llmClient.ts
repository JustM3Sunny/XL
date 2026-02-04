import { GoogleGenerativeAI, Part, FunctionDeclaration } from "@google/generative-ai";
import { Config } from "../config/config.js";
import { StreamEvent, StreamEventType, TokenUsage, ToolCall } from "./response.js";

export class LLMClient {
  private geminiClient?: GoogleGenerativeAI;
  private maxRetries = 3;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  getGeminiClient(): GoogleGenerativeAI {
    if (!this.geminiClient) {
      if (!this.config.geminiApiKey) {
        throw new Error("Gemini API key not configured.");
      }
      this.geminiClient = new GoogleGenerativeAI(this.config.geminiApiKey);
    }
    return this.geminiClient;
  }

  async close(): Promise<void> {
    this.geminiClient = undefined;
  }

  async *chatCompletion(
    messages: Array<Record<string, any>>,
    tools?: Array<Record<string, any>>,
    stream = true,
  ): AsyncGenerator<StreamEvent, void, void> {
    yield* this.chatCompletionGemini(messages, tools, stream);
  }

  private splitSystemMessage(messages: Array<Record<string, any>>): { system: string | null; rest: Array<Record<string, any>> } {
    const systemMessage = messages.find((msg) => msg.role === "system");
    const rest = messages.filter((msg) => msg.role !== "system");
    return { system: systemMessage?.content ?? null, rest };
  }

  private safeJsonParse(payload?: string | null): Record<string, any> {
    if (!payload) {
      return {};
    }
    try {
      return JSON.parse(payload);
    } catch {
      return { raw_arguments: payload };
    }
  }

  private mapMessagesToGeminiContents(messages: Array<Record<string, any>>): Array<{ role: string; parts: Part[] }> {
    return messages.map((msg) => {
      if (msg.role === "tool") {
        return {
          role: "user",
          parts: [{ text: msg.content ?? "" }],
        };
      }

      if (msg.role === "assistant" && msg.tool_calls) {
        const toolParts: Part[] = [];
        for (const call of msg.tool_calls) {
          toolParts.push({
            functionCall: {
              name: call.function?.name,
              args: this.safeJsonParse(call.function?.arguments),
            },
          });
        }
        if (msg.content) {
          toolParts.unshift({ text: msg.content });
        }
        return { role: "model", parts: toolParts };
      }

      return {
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content ?? "" }],
      };
    });
  }

  private buildGeminiTools(tools: Array<Record<string, any>>): FunctionDeclaration[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.parameters ?? {},
    }));
  }

  private async *chatCompletionGemini(
    messages: Array<Record<string, any>>,
    tools?: Array<Record<string, any>>,
    stream = true,
  ): AsyncGenerator<StreamEvent, void, void> {
    const client = this.getGeminiClient();
    const { system, rest } = this.splitSystemMessage(messages);
    const model = client.getGenerativeModel({
      model: this.config.modelName,
      systemInstruction: system ?? undefined,
      tools: tools && tools.length > 0 ? [{ functionDeclarations: this.buildGeminiTools(tools) }] : undefined,
      generationConfig: {
        temperature: this.config.temperature,
      },
    });

    const contents = this.mapMessagesToGeminiContents(rest);

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        if (stream) {
          const response = await model.generateContentStream({ contents });
          let usage: TokenUsage | undefined;
          const toolCalls: ToolCall[] = [];

          for await (const chunk of response.stream) {
            if (chunk.usageMetadata) {
              usage = {
                promptTokens: chunk.usageMetadata.promptTokenCount ?? 0,
                completionTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
                totalTokens: chunk.usageMetadata.totalTokenCount ?? 0,
                cachedTokens: 0,
              };
            }

            const text = chunk.text();
            if (text) {
              yield { type: StreamEventType.TEXT_DELTA, textDelta: { content: text } };
            }

            const candidates = chunk.candidates ?? [];
            for (const candidate of candidates) {
              const parts = candidate.content?.parts ?? [];
              for (const part of parts) {
                if (part.functionCall) {
                  const callId = `${part.functionCall.name}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
                  toolCalls.push({
                    callId,
                    name: part.functionCall.name,
                    arguments: part.functionCall.args ?? {},
                  });
                }
              }
            }
          }

          for (const toolCall of toolCalls) {
            yield { type: StreamEventType.TOOL_CALL_COMPLETE, toolCall };
          }

          yield { type: StreamEventType.MESSAGE_COMPLETE, usage };
          return;
        }

        const response = await model.generateContent({ contents });
        const text = response.response.text();
        const usage = response.response.usageMetadata
          ? {
              promptTokens: response.response.usageMetadata.promptTokenCount ?? 0,
              completionTokens: response.response.usageMetadata.candidatesTokenCount ?? 0,
              totalTokens: response.response.usageMetadata.totalTokenCount ?? 0,
              cachedTokens: 0,
            }
          : undefined;

        const toolCalls: ToolCall[] = [];
        const parts = response.response.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          if (part.functionCall) {
            toolCalls.push({
              callId: `${part.functionCall.name}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
              name: part.functionCall.name,
              arguments: part.functionCall.args ?? {},
            });
          }
        }

        if (toolCalls.length > 0) {
          for (const toolCall of toolCalls) {
            yield { type: StreamEventType.TOOL_CALL_COMPLETE, toolCall };
          }
        }

        yield { type: StreamEventType.MESSAGE_COMPLETE, textDelta: text ? { content: text } : undefined, usage };
        return;
      } catch (error: any) {
        if (attempt < this.maxRetries) {
          const waitTime = 2 ** attempt * 1000;
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        } else {
          yield { type: StreamEventType.ERROR, error: error?.message ?? String(error) };
          return;
        }
      }
    }
  }

  // OpenAI-compatible providers removed; Gemini-only runtime.
}
