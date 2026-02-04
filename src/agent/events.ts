export enum AgentEventType {
  AGENT_START = "agent_start",
  AGENT_END = "agent_end",
  TEXT_DELTA = "text_delta",
  TEXT_COMPLETE = "text_complete",
  TOOL_CALL_START = "tool_call_start",
  TOOL_CALL_COMPLETE = "tool_call_complete",
  AGENT_ERROR = "agent_error",
}

export interface AgentEvent {
  type: AgentEventType;
  data: Record<string, any>;
}

export const AgentEventFactory = {
  agentStart(message: string): AgentEvent {
    return { type: AgentEventType.AGENT_START, data: { message } };
  },
  agentEnd(response?: string | null): AgentEvent {
    return { type: AgentEventType.AGENT_END, data: { response } };
  },
  textDelta(content: string): AgentEvent {
    return { type: AgentEventType.TEXT_DELTA, data: { content } };
  },
  textComplete(content: string): AgentEvent {
    return { type: AgentEventType.TEXT_COMPLETE, data: { content } };
  },
  toolCallStart(callId: string, name: string, argumentsPayload: Record<string, any>): AgentEvent {
    return {
      type: AgentEventType.TOOL_CALL_START,
      data: { call_id: callId, name, arguments: argumentsPayload },
    };
  },
  toolCallComplete(callId: string, name: string, result: any): AgentEvent {
    return {
      type: AgentEventType.TOOL_CALL_COMPLETE,
      data: {
        call_id: callId,
        name,
        success: result.success,
        output: result.output,
        error: result.error,
        metadata: result.metadata,
        diff: result.diff ? result.diff.toDiff() : null,
        truncated: result.truncated,
        exit_code: result.exitCode,
      },
    };
  },
  agentError(error: string): AgentEvent {
    return { type: AgentEventType.AGENT_ERROR, data: { error } };
  },
};
