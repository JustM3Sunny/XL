export interface TextDelta {
  content: string;
}

export enum StreamEventType {
  TEXT_DELTA = "text_delta",
  MESSAGE_COMPLETE = "message_complete",
  ERROR = "error",
  TOOL_CALL_START = "tool_call_start",
  TOOL_CALL_DELTA = "tool_call_delta",
  TOOL_CALL_COMPLETE = "tool_call_complete",
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    cachedTokens: a.cachedTokens + b.cachedTokens,
  };
}

export interface ToolCallDelta {
  callId: string;
  name?: string;
  argumentsDelta?: string;
}

export interface ToolCall {
  callId: string;
  name?: string;
  arguments: Record<string, unknown>;
}

export interface StreamEvent {
  type: StreamEventType;
  textDelta?: TextDelta;
  error?: string;
  finishReason?: string;
  toolCallDelta?: ToolCallDelta;
  toolCall?: ToolCall;
  usage?: TokenUsage;
}

export interface ToolResultMessage {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export function parseToolCallArguments(argumentsStr?: string | null): Record<string, unknown> {
  if (!argumentsStr) {
    return {};
  }

  try {
    return JSON.parse(argumentsStr);
  } catch (error) {
    return { raw_arguments: argumentsStr };
  }
}
