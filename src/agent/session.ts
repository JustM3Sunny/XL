import { LLMClient } from "../client/llmClient.js";
import { Config } from "../config/config.js";
import { getDataDir } from "../config/loader.js";
import { ChatCompactor } from "../context/compaction.js";
import { LoopDetector } from "../context/loopDetector.js";
import { ContextManager } from "../context/manager.js";
import { HookSystem } from "../hooks/hookSystem.js";
import { ApprovalManager } from "../safety/approval.js";
import { ToolDiscoveryManager } from "../tools/discovery.js";
import { MCPManager } from "../tools/mcp/mcpManager.js";
import { createDefaultRegistry } from "../tools/registry.js";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export class Session {
  config: Config;
  client: LLMClient;
  toolRegistry: ReturnType<typeof createDefaultRegistry>;
  contextManager!: ContextManager;
  discoveryManager: ToolDiscoveryManager;
  mcpManager: MCPManager;
  chatCompactor: ChatCompactor;
  approvalManager: ApprovalManager;
  loopDetector = new LoopDetector();
  hookSystem: HookSystem;
  sessionId = randomUUID();
  createdAt = new Date();
  updatedAt = new Date();
  turnCount = 0;

  constructor(config: Config) {
    this.config = config;
    this.client = new LLMClient(config);
    this.toolRegistry = createDefaultRegistry(config);
    this.discoveryManager = new ToolDiscoveryManager(config, this.toolRegistry);
    this.mcpManager = new MCPManager(config);
    this.chatCompactor = new ChatCompactor(this.client);
    this.approvalManager = new ApprovalManager(config.approval, config.cwd);
    this.hookSystem = new HookSystem(config);
  }

  async initialize(): Promise<void> {
    await this.mcpManager.initialize();
    this.mcpManager.registerTools(this.toolRegistry);
    await this.discoveryManager.discoverAll();
    this.contextManager = new ContextManager(this.config, this.loadMemory(), this.toolRegistry.getTools());
  }

  private loadMemory(): string | null {
    const dataDir = getDataDir();
    fs.mkdirSync(dataDir, { recursive: true });
    const filePath = path.join(dataDir, "user_memory.json");

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(content) as { entries?: Record<string, string> };
      if (!data.entries || Object.keys(data.entries).length === 0) {
        return null;
      }

      const lines = ["User preferences and notes:"];
      for (const [key, value] of Object.entries(data.entries)) {
        lines.push(`- ${key}: ${value}`);
      }

      return lines.join("\n");
    } catch (error) {
      return null;
    }
  }

  incrementTurn(): number {
    this.turnCount += 1;
    this.updatedAt = new Date();
    return this.turnCount;
  }

  getStats(): Record<string, any> {
    return {
      session_id: this.sessionId,
      created_at: this.createdAt.toISOString(),
      turn_count: this.turnCount,
      message_count: this.contextManager.messageCount,
      token_usage: this.contextManager.totalUsage,
      tools_count: this.toolRegistry.getTools().length,
      mcp_servers: this.toolRegistry.connectedMcpServers.length,
    };
  }
}
