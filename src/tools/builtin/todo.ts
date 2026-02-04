import { Tool, ToolInvocation, ToolKind, ToolResultFactory } from "../base.js";
import { randomUUID } from "node:crypto";

export class TodosTool extends Tool {
  name = "todos";
  description = "Manage a task list for the current session. Use this to track progress on multi-step tasks.";
  kind = ToolKind.MEMORY;

  private todos = new Map<string, string>();

  get schema() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "Action: 'add', 'complete', 'list', 'clear'",
          },
          id: {
            type: "string",
            description: "Todo ID (for complete)",
          },
          content: {
            type: "string",
            description: "Todo content (for add)",
          },
        },
        required: ["action"],
      },
    };
  }

  async execute(invocation: ToolInvocation) {
    const params = invocation.params as { action: string; id?: string; content?: string };
    const action = params.action.toLowerCase();

    if (action === "add") {
      if (!params.content) {
        return ToolResultFactory.error("`content` required for 'add' action");
      }
      const todoId = randomUUID().slice(0, 8);
      this.todos.set(todoId, params.content);
      return ToolResultFactory.success(`Added todo [${todoId}]: ${params.content}`);
    }

    if (action === "complete") {
      if (!params.id) {
        return ToolResultFactory.error("`id` required for 'complete' action");
      }
      if (!this.todos.has(params.id)) {
        return ToolResultFactory.error(`Todo not found: ${params.id}`);
      }
      const content = this.todos.get(params.id)!;
      this.todos.delete(params.id);
      return ToolResultFactory.success(`Completed todo [${params.id}]: ${content}`);
    }

    if (action === "list") {
      if (this.todos.size === 0) {
        return ToolResultFactory.success("No todos");
      }
      const lines = ["Todos:"];
      for (const [id, content] of this.todos.entries()) {
        lines.push(`  [${id}] ${content}`);
      }
      return ToolResultFactory.success(lines.join("\n"));
    }

    if (action === "clear") {
      const count = this.todos.size;
      this.todos.clear();
      return ToolResultFactory.success(`Cleared ${count} todos`);
    }

    return ToolResultFactory.error(`Unknown action: ${params.action}`);
  }
}
