import { Config } from "../../config/config.js";
import { MCPClient, MCPServerStatus } from "./client.js";
import { MCPTool } from "./mcpTool.js";
import { ToolRegistry } from "../registry.js";

export class MCPManager {
  private config: Config;
  private clients = new Map<string, MCPClient>();
  private initialized = false;

  constructor(config: Config) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const configs = this.config.mcpServers;
    if (!configs || Object.keys(configs).length === 0) {
      return;
    }

    for (const [name, serverConfig] of Object.entries(configs)) {
      if (!serverConfig.enabled) {
        continue;
      }
      this.clients.set(name, new MCPClient(name, serverConfig, this.config.cwd));
    }

    await Promise.all(
      Array.from(this.clients.values()).map((client) =>
        Promise.race([
          client.connect(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("MCP startup timeout")), client.config.startupTimeoutSec * 1000)),
        ]).catch(() => undefined),
      ),
    );

    this.initialized = true;
  }

  registerTools(registry: ToolRegistry): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.status !== MCPServerStatus.CONNECTED) {
        continue;
      }
      for (const toolInfo of client.tools) {
        const mcpTool = new MCPTool(this.config, client, toolInfo, `${client.name}__${toolInfo.name}`);
        registry.registerMcpTool(mcpTool);
        count += 1;
      }
    }
    return count;
  }

  async shutdown(): Promise<void> {
    await Promise.all(Array.from(this.clients.values()).map((client) => client.disconnect()));
    this.clients.clear();
    this.initialized = false;
  }

  getAllServers(): Array<{ name: string; status: string; tools: number }> {
    const servers: Array<{ name: string; status: string; tools: number }> = [];
    for (const [name, client] of this.clients.entries()) {
      servers.push({ name, status: client.status, tools: client.tools.length });
    }
    return servers;
  }
}
