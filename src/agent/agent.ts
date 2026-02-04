import { AgentEventFactory, AgentEventType } from "./events.js";
import { Session } from "./session.js";
import { StreamEventType } from "../client/response.js";
import { Config } from "../config/config.js";
import { createLoopBreakerPrompt } from "../prompts/system.js";

export class Agent {
  config: Config;
  session: Session;

  constructor(config: Config, confirmationCallback?: (confirmation: any) => boolean | Promise<boolean>) {
    this.config = config;
    this.session = new Session(config);
    if (confirmationCallback) {
      this.session.approvalManager.confirmationCallback = confirmationCallback;
    }
  }

  async *run(message: string) {
    await this.session.hookSystem.triggerBeforeAgent(message);
    yield AgentEventFactory.agentStart(message);
    this.session.contextManager.addUserMessage(message);

    if (this.config.autoplan) {
      const plan = await this.generatePlan(message);
      if (plan) {
        this.session.contextManager.addAssistantMessage(plan);
        yield AgentEventFactory.textComplete(plan);
      }
    }

    let finalResponse: string | null = null;

    for await (const event of this.agenticLoop()) {
      yield event;
      if (event.type === AgentEventType.TEXT_COMPLETE) {
        finalResponse = event.data.content as string;
      }
    }

    await this.session.hookSystem.triggerAfterAgent(message, finalResponse ?? undefined);
    yield AgentEventFactory.agentEnd(finalResponse ?? undefined);
  }

  private async generatePlan(message: string): Promise<string | null> {
    const planningMessages = [
      {
        role: "system",
        content:
          "You are a planning assistant for an autonomous coding agent. Provide a brief, actionable plan (3-7 bullets) without chain-of-thought or hidden reasoning.",
      },
      {
        role: "user",
        content: message,
      },
    ];

    let plan = "";
    for await (const event of this.session.client.chatCompletion(planningMessages, undefined, false)) {
      if (event.type === StreamEventType.ERROR) {
        return null;
      }
      if (event.type === StreamEventType.MESSAGE_COMPLETE && event.textDelta?.content) {
        plan += event.textDelta.content;
      }
    }

    if (!plan.trim()) {
      return null;
    }

    return `Plan:\\n${plan.trim()}`;
  }

  private async *agenticLoop() {
    const maxTurns = this.config.maxTurns;

    for (let turn = 0; turn < maxTurns; turn += 1) {
      this.session.incrementTurn();
      let responseText = "";

      if (this.session.contextManager.needsCompression(this.config.model.contextWindow)) {
        const { summary, usage } = await this.session.chatCompactor.compress(this.session.contextManager);
        if (summary) {
          this.session.contextManager.replaceWithSummary(summary);
          if (usage) {
            this.session.contextManager.setLatestUsage(usage);
            this.session.contextManager.addUsage(usage);
          }
        }
      }

      const toolSchemas = this.session.toolRegistry.getSchemas();
      const toolCalls: Array<{ call_id: string; name: string; arguments: Record<string, any> }> = [];
      let usage: any = null;

      for await (const event of this.session.client.chatCompletion(
        this.session.contextManager.getMessages(),
        toolSchemas.length ? toolSchemas : undefined,
      )) {
        if (event.type === StreamEventType.TEXT_DELTA && event.textDelta?.content) {
          responseText += event.textDelta.content;
          yield AgentEventFactory.textDelta(event.textDelta.content);
        } else if (event.type === StreamEventType.TOOL_CALL_COMPLETE && event.toolCall) {
          toolCalls.push({
            call_id: event.toolCall.callId,
            name: event.toolCall.name ?? "",
            arguments: event.toolCall.arguments ?? {},
          });
        } else if (event.type === StreamEventType.ERROR) {
          yield AgentEventFactory.agentError(event.error ?? "Unknown error occurred.");
        } else if (event.type === StreamEventType.MESSAGE_COMPLETE) {
          usage = event.usage;
        }
      }

      this.session.contextManager.addAssistantMessage(
        responseText || null,
        toolCalls.length
          ? toolCalls.map((call) => ({
              id: call.call_id,
              type: "function",
              function: {
                name: call.name,
                arguments: JSON.stringify(call.arguments ?? {}),
              },
            }))
          : null,
      );

      if (responseText) {
        yield AgentEventFactory.textComplete(responseText);
        this.session.loopDetector.recordAction("response", { text: responseText });
      }

      if (toolCalls.length === 0) {
        if (usage) {
          this.session.contextManager.setLatestUsage(usage);
          this.session.contextManager.addUsage(usage);
        }
        this.session.contextManager.pruneToolOutputs();
        return;
      }

      const toolResults: Array<{ tool_call_id: string; content: string; is_error: boolean }> = [];

      for (const toolCall of toolCalls) {
        yield AgentEventFactory.toolCallStart(toolCall.call_id, toolCall.name, toolCall.arguments);
        this.session.loopDetector.recordAction("tool_call", { toolName: toolCall.name, args: toolCall.arguments });

        const result = await this.session.toolRegistry.invoke(
          toolCall.name,
          toolCall.arguments,
          this.config.cwd,
          this.session.hookSystem,
          this.session.approvalManager,
        );

        yield AgentEventFactory.toolCallComplete(toolCall.call_id, toolCall.name, result);

        toolResults.push({
          tool_call_id: toolCall.call_id,
          content: result.success ? result.output : `Error: ${result.error}\n\nOutput:\n${result.output}`,
          is_error: !result.success,
        });
      }

      for (const result of toolResults) {
        this.session.contextManager.addToolResult(result.tool_call_id, result.content);
      }

      const loopError = this.session.loopDetector.checkForLoop();
      if (loopError) {
        const loopPrompt = createLoopBreakerPrompt(loopError);
        this.session.contextManager.addUserMessage(loopPrompt);
      }

      if (usage) {
        this.session.contextManager.setLatestUsage(usage);
        this.session.contextManager.addUsage(usage);
      }

      this.session.contextManager.pruneToolOutputs();
    }

    yield AgentEventFactory.agentError(`Maximum turns (${maxTurns}) reached`);
  }

  async initialize(): Promise<void> {
    await this.session.initialize();
  }

  async close(): Promise<void> {
    await this.session.client.close();
    await this.session.mcpManager.shutdown();
  }
}
