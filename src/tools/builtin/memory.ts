import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "../../config/loader.js";
import { Tool, ToolInvocation, ToolKind, ToolResultFactory } from "../base.js";

export class MemoryTool extends Tool {
  name = "memory";
  description = "Store and retrieve persistent memory. Use this to remember user preferences, important context or notes.";
  kind = ToolKind.MEMORY;

  get schema() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "Action: 'set', 'get', 'delete', 'list', 'clear'",
          },
          key: {
            type: "string",
            description: "Memory key (required for `set`, `get`, `delete`)",
          },
          value: {
            type: "string",
            description: "Value to store (required for `set`)",
          },
        },
        required: ["action"],
      },
    };
  }

  private loadMemory(): { entries: Record<string, string> } {
    const dataDir = getDataDir();
    fs.mkdirSync(dataDir, { recursive: true });
    const filePath = path.join(dataDir, "user_memory.json");

    if (!fs.existsSync(filePath)) {
      return { entries: {} };
    }

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      return { entries: {} };
    }
  }

  private saveMemory(memory: { entries: Record<string, string> }) {
    const dataDir = getDataDir();
    fs.mkdirSync(dataDir, { recursive: true });
    const filePath = path.join(dataDir, "user_memory.json");
    fs.writeFileSync(filePath, JSON.stringify(memory, null, 2), "utf-8");
  }

  async execute(invocation: ToolInvocation) {
    const params = invocation.params as { action: string; key?: string; value?: string };
    const action = params.action.toLowerCase();

    if (action === "set") {
      if (!params.key || !params.value) {
        return ToolResultFactory.error("`key` and `value` are required for 'set' action");
      }
      const memory = this.loadMemory();
      memory.entries[params.key] = params.value;
      this.saveMemory(memory);
      return ToolResultFactory.success(`Set memory: ${params.key}`);
    }

    if (action === "get") {
      if (!params.key) {
        return ToolResultFactory.error("`key` required for 'get' action");
      }
      const memory = this.loadMemory();
      if (!memory.entries[params.key]) {
        return ToolResultFactory.success(`Memory not found: ${params.key}`, { metadata: { found: false } });
      }
      return ToolResultFactory.success(`Memory found: ${params.key}: ${memory.entries[params.key]}`, { metadata: { found: true } });
    }

    if (action === "delete") {
      if (!params.key) {
        return ToolResultFactory.error("`key` required for 'delete' action");
      }
      const memory = this.loadMemory();
      if (!memory.entries[params.key]) {
        return ToolResultFactory.success(`Memory not found: ${params.key}`);
      }
      delete memory.entries[params.key];
      this.saveMemory(memory);
      return ToolResultFactory.success(`Deleted memory: ${params.key}`);
    }

    if (action === "list") {
      const memory = this.loadMemory();
      const entries = memory.entries;
      if (Object.keys(entries).length === 0) {
        return ToolResultFactory.success("No memories stored", { metadata: { found: false } });
      }
      const lines = ["Stored memories:", ...Object.entries(entries).map(([key, value]) => `  ${key}: ${value}`)];
      return ToolResultFactory.success(lines.join("\n"), { metadata: { found: true } });
    }

    if (action === "clear") {
      const memory = this.loadMemory();
      const count = Object.keys(memory.entries).length;
      memory.entries = {};
      this.saveMemory(memory);
      return ToolResultFactory.success(`Cleared ${count} memory entries`);
    }

    return ToolResultFactory.error(`Unknown action: ${params.action}`);
  }
}
