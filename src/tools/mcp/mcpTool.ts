import { Config } from "../../config/config.js";
import { Tool, ToolInvocation, ToolKind, ToolResultFactory } from "../base.js";
import { MCPClient, MCPToolInfo } from "./client.js";

export class MCPTool extends Tool {
  private toolInfo: MCPToolInfo;
  private client: MCPClient;
  name: string;
  description: string;
  kind = ToolKind.MCP;

  constructor(config: Config, client: MCPClient, toolInfo: MCPToolInfo, name: string) {
    super(config);
    this.toolInfo = toolInfo;
    this.client = client;
    this.name = name;
    this.description = toolInfo.description;
  }

  get schema() {
    const inputSchema = this.toolInfo.inputSchema ?? {};
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: "object",
        properties: inputSchema.properties ?? {},
        required: inputSchema.required ?? [],
      },
    };
  }

  isMutating(): boolean {
    return true;
  }

  async execute(invocation: ToolInvocation) {
    try {
      const result = await this.client.callTool(this.toolInfo.name, invocation.params);
      const output = result.output ?? result.content ?? "";
      const isError = result.is_error ?? result.isError ?? false;

      if (isError) {
        return ToolResultFactory.error(output);
      }
      return ToolResultFactory.success(output);
    } catch (error) {
      return ToolResultFactory.error(`MCP tool failed: ${String(error)}`);
    }
  }
}
