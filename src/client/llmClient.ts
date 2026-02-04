import OpenAI from "openai";
import { Config } from "../config/config.js";
import {
  parseToolCallArguments,
  StreamEvent,
  StreamEventType,
  TokenUsage,
  ToolCall,
  ToolCallDelta,
} from "./response.js";

export class LLMClient {
  private client?: OpenAI;
  private maxRetries = 3;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseUrl,
      });
    }

    return this.client;
  }

  async close(): Promise<void> {
    this.client = undefined;
  }

  buildTools(tools: Array<Record<string, any>>) {
    return tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description ?? "",
        parameters: tool.parameters ?? {
          type: "object",
          properties: {},
        },
      },
    }));
  }

  async *chatCompletion(
    messages: Array<Record<string, any>>,
    tools?: Array<Record<string, any>>,
    stream = true,
  ): AsyncGenerator<StreamEvent, void, void> {
    const client = this.getClient();

    const payload: Record<string, any> = {
      model: this.config.modelName,
      messages,
      stream,
    };

    if (tools && tools.length > 0) {
      payload.tools = this.buildTools(tools);
      payload.tool_choice = "auto";
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        if (stream) {
          yield* this.streamResponse(client, payload);
        } else {
          yield await this.nonStreamResponse(client, payload);
        }
        return;
      } catch (error: any) {
        if (attempt < this.maxRetries) {
          const waitTime = 2 ** attempt * 1000;
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        } else {
          yield {
            type: StreamEventType.ERROR,
            error: error?.message ?? String(error),
          };
          return;
        }
      }
    }
  }

  private async *streamResponse(client: OpenAI, payload: Record<string, any>) {
    const response = await client.chat.completions.create(payload);

    let finishReason: string | null = null;
    let usage: TokenUsage | undefined;
    const toolCalls: Record<number, { id: string; name: string; arguments: string }> = {};

    for await (const chunk of response) {
      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens ?? 0,
          completionTokens: chunk.usage.completion_tokens ?? 0,
          totalTokens: chunk.usage.total_tokens ?? 0,
          cachedTokens: chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
        };
      }

      if (!chunk.choices || chunk.choices.length === 0) {
        continue;
      }

      const choice = chunk.choices[0];
      const delta = choice.delta;

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }

      if (delta?.content) {
        yield {
          type: StreamEventType.TEXT_DELTA,
          textDelta: { content: delta.content },
        };
      }

      if (delta?.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          const idx = toolCallDelta.index ?? 0;
          if (!toolCalls[idx]) {
            toolCalls[idx] = {
              id: toolCallDelta.id ?? "",
              name: "",
              arguments: "",
            };
          }

          if (toolCallDelta.function?.name) {
            toolCalls[idx].name = toolCallDelta.function.name;
            yield {
              type: StreamEventType.TOOL_CALL_START,
              toolCallDelta: {
                callId: toolCalls[idx].id,
                name: toolCallDelta.function.name,
              } as ToolCallDelta,
            };
          }

          if (toolCallDelta.function?.arguments) {
            toolCalls[idx].arguments += toolCallDelta.function.arguments;
            yield {
              type: StreamEventType.TOOL_CALL_DELTA,
              toolCallDelta: {
                callId: toolCalls[idx].id,
                name: toolCallDelta.function.name,
                argumentsDelta: toolCallDelta.function.arguments,
              } as ToolCallDelta,
            };
          }
        }
      }
    }

    for (const [, toolCall] of Object.entries(toolCalls)) {
      yield {
        type: StreamEventType.TOOL_CALL_COMPLETE,
        toolCall: {
          callId: toolCall.id,
          name: toolCall.name,
          arguments: parseToolCallArguments(toolCall.arguments),
        } as ToolCall,
      };
    }

    yield {
      type: StreamEventType.MESSAGE_COMPLETE,
      finishReason: finishReason ?? undefined,
      usage,
    };
  }

  private async nonStreamResponse(client: OpenAI, payload: Record<string, any>): Promise<StreamEvent> {
    const response = await client.chat.completions.create(payload);
    const choice = response.choices[0];
    const message = choice.message;

    const usage: TokenUsage | undefined = response.usage
      ? {
          promptTokens: response.usage.prompt_tokens ?? 0,
          completionTokens: response.usage.completion_tokens ?? 0,
          totalTokens: response.usage.total_tokens ?? 0,
          cachedTokens: response.usage.prompt_tokens_details?.cached_tokens ?? 0,
        }
      : undefined;

    if (message?.tool_calls && message.tool_calls.length > 0) {
      const toolCalls: ToolCall[] = message.tool_calls.map((call) => ({
        callId: call.id,
        name: call.function.name,
        arguments: parseToolCallArguments(call.function.arguments),
      }));

      return {
        type: StreamEventType.MESSAGE_COMPLETE,
        finishReason: choice.finish_reason ?? undefined,
        usage,
        toolCall: toolCalls[0],
      };
    }

    return {
      type: StreamEventType.MESSAGE_COMPLETE,
      finishReason: choice.finish_reason ?? undefined,
      usage,
      textDelta: message?.content ? { content: message.content } : undefined,
    };
  }
}
