import { Config } from "../config/config.js";
import { Tool, ToolInvocation, ToolResult, ToolResultFactory } from "./base.js";
import { Agent } from "../agent/agent.js";
import { AgentEventType } from "../agent/events.js";

export interface SubagentDefinition {
  name: string;
  description: string;
  goalPrompt: string;
  allowedTools?: string[] | null;
  maxTurns?: number;
  timeoutSeconds?: number;
}

export class SubagentTool extends Tool {
  definition: SubagentDefinition;

  constructor(config: Config, definition: SubagentDefinition) {
    super(config);
    this.definition = definition;
  }

  get name(): string {
    return `subagent_${this.definition.name}`;
  }

  get description(): string {
    return `subagent_${this.definition.description}`;
  }

  get schema() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: "object",
        properties: {
          goal: {
            type: "string",
            description: "The specific task or goal for the subagent to accomplish",
          },
        },
        required: ["goal"],
      },
    };
  }

  isMutating(): boolean {
    return true;
  }

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const goal = invocation.params.goal as string;
    if (!goal) {
      return ToolResultFactory.error("No goal specified for sub-agent");
    }

    const configDict = this.config.toJSON();
    const subagentConfig = new Config({
      ...configDict,
      maxTurns: this.definition.maxTurns ?? 20,
      allowedTools: this.definition.allowedTools ?? undefined,
    });

    const prompt = `You are a specialized sub-agent with a specific task to complete.\n\n${this.definition.goalPrompt}\n\nYOUR TASK:\n${goal}\n\nIMPORTANT:\n- Focus only on completing the specified task\n- Do not engage in unrelated actions\n- Once you have completed the task or have the answer, provide your final response\n- Be concise and direct in your output`;

    const toolCalls: string[] = [];
    let finalResponse: string | null = null;
    let error: string | null = null;
    let termination = "goal";

    try {
      const agent = new Agent(subagentConfig);
      const deadline = Date.now() + (this.definition.timeoutSeconds ?? 600) * 1000;

      for await (const event of agent.run(prompt)) {
        if (Date.now() > deadline) {
          termination = "timeout";
          finalResponse = "Sub-agent timed out";
          break;
        }

        if (event.type === AgentEventType.TOOL_CALL_START) {
          const name = event.data.name as string;
          if (name) {
            toolCalls.push(name);
          }
        }

        if (event.type === AgentEventType.TEXT_COMPLETE) {
          finalResponse = event.data.content as string;
        }

        if (event.type === AgentEventType.AGENT_END) {
          if (!finalResponse) {
            finalResponse = event.data.response as string;
          }
        }

        if (event.type === AgentEventType.AGENT_ERROR) {
          termination = "error";
          error = event.data.error as string;
          finalResponse = `Sub-agent error: ${error}`;
          break;
        }
      }
    } catch (err) {
      termination = "error";
      error = String(err);
      finalResponse = `Sub-agent failed: ${error}`;
    }

    const result = `Sub-agent '${this.definition.name}' completed.\nTermination: ${termination}\nTools called: ${toolCalls.length ? toolCalls.join(", ") : "None"}\n\nResult:\n${finalResponse ?? "No response"}`;

    if (error) {
      return ToolResultFactory.error(result);
    }

    return ToolResultFactory.success(result);
  }
}

export const CODEBASE_INVESTIGATOR: SubagentDefinition = {
  name: "codebase_investigator",
  description: "Investigates the codebase to answer questions about code structure, patterns, and implementations",
  goalPrompt: `You are a codebase investigation specialist.\nYour job is to explore and understand code to answer questions.\nUse read_file, grep, glob, and list_dir to investigate.\nDo NOT modify any files.`,
  allowedTools: ["read_file", "grep", "glob", "list_dir"],
};

export const CODE_REVIEWER: SubagentDefinition = {
  name: "code_reviewer",
  description: "Reviews code changes and provides feedback on quality, bugs, and improvements",
  goalPrompt: `You are a code review specialist.\nYour job is to review code and provide constructive feedback.\nLook for bugs, code smells, security issues, and improvement opportunities.\nUse read_file, list_dir and grep to examine the code.\nDo NOT modify any files.`,
  allowedTools: ["read_file", "grep", "list_dir"],
  maxTurns: 10,
  timeoutSeconds: 300,
};

export function getDefaultSubagentDefinitions(): SubagentDefinition[] {
  return [CODEBASE_INVESTIGATOR, CODE_REVIEWER];
}
