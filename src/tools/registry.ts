import { Config } from "../config/config.js";
import { HookSystem } from "../hooks/hookSystem.js";
import { ApprovalContext, ApprovalDecision, ApprovalManager } from "../safety/approval.js";
import { Tool, ToolInvocation, ToolResult, ToolResultFactory } from "./base.js";
import { getAllBuiltinTools } from "./builtin/index.js";
import { SubagentTool, getDefaultSubagentDefinitions } from "./subagents.js";

export class ToolRegistry {
  private tools = new Map<string, Tool>();
  private mcpTools = new Map<string, Tool>();
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  get connectedMcpServers(): Tool[] {
    return Array.from(this.mcpTools.values());
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  registerMcpTool(tool: Tool): void {
    this.mcpTools.set(tool.name, tool);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name) ?? this.mcpTools.get(name);
  }

  getTools(): Tool[] {
    let allTools = [...this.tools.values(), ...this.mcpTools.values()];
    if (this.config.allowedTools && this.config.allowedTools.length > 0) {
      const allowed = new Set(this.config.allowedTools);
      allTools = allTools.filter((tool) => allowed.has(tool.name));
    }
    return allTools;
  }

  getSchemas(): Array<Record<string, any>> {
    return this.getTools().map((tool) => tool.toOpenAISchema());
  }

  async invoke(
    name: string,
    params: Record<string, any>,
    cwd: string,
    hookSystem: HookSystem,
    approvalManager?: ApprovalManager | null,
  ): Promise<ToolResult> {
    const tool = this.get(name);
    if (!tool) {
      const result = ToolResultFactory.error(`Unknown tool: ${name}`, "", { metadata: { tool_name: name } });
      await hookSystem.triggerAfterTool(name, params, result);
      return result;
    }

    const validationErrors = tool.validateParams(params);
    if (validationErrors.length > 0) {
      const result = ToolResultFactory.error(
        `Invalid parameters: ${validationErrors.join("; ")}`,
        "",
        { metadata: { tool_name: name, validation_errors: validationErrors } },
      );
      await hookSystem.triggerAfterTool(name, params, result);
      return result;
    }

    await hookSystem.triggerBeforeTool(name, params);
    const invocation: ToolInvocation = { params, cwd };

    if (approvalManager) {
      const confirmation = await tool.getConfirmation(invocation);
      if (confirmation) {
        const context: ApprovalContext = {
          toolName: name,
          params,
          isMutating: tool.isMutating(),
          affectedPaths: confirmation.affectedPaths ?? [],
          command: confirmation.command ?? undefined,
          isDangerous: confirmation.isDangerous ?? false,
        };

        const decision = await approvalManager.checkApproval(context);
        if (decision === ApprovalDecision.REJECTED) {
          const result = ToolResultFactory.error("Operation rejected by safety policy");
          await hookSystem.triggerAfterTool(name, params, result);
          return result;
        }
        if (decision === ApprovalDecision.NEEDS_CONFIRMATION) {
          const approved = await approvalManager.requestConfirmation(confirmation);
          if (!approved) {
            const result = ToolResultFactory.error("User rejected the operation");
            await hookSystem.triggerAfterTool(name, params, result);
            return result;
          }
        }
      }
    }

    try {
      const result = await tool.execute(invocation);
      await hookSystem.triggerAfterTool(name, params, result);
      return result;
    } catch (error) {
      const result = ToolResultFactory.error(`Internal error: ${String(error)}`);
      await hookSystem.triggerAfterTool(name, params, result);
      return result;
    }
  }
}

export function createDefaultRegistry(config: Config): ToolRegistry {
  const registry = new ToolRegistry(config);
  for (const toolClass of getAllBuiltinTools()) {
    registry.register(new toolClass(config));
  }

  for (const definition of getDefaultSubagentDefinitions()) {
    registry.register(new SubagentTool(config, definition));
  }

  return registry;
}
