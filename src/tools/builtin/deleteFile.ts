import fs from "node:fs";
import path from "node:path";
import { Tool, ToolConfirmation, ToolInvocation, ToolKind, ToolResultFactory } from "../base.js";
import { resolvePath } from "../../utils/paths.js";

export class DeleteFileTool extends Tool {
  name = "delete_file";
  description = "Delete a file or directory (recursively).";
  kind = ToolKind.WRITE;

  get schema() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to delete (file or directory)",
          },
          recursive: {
            type: "boolean",
            description: "Delete directories recursively",
          },
        },
        required: ["path"],
      },
    };
  }

  async getConfirmation(invocation: ToolInvocation): Promise<ToolConfirmation | null> {
    const target = resolvePath(invocation.cwd, invocation.params.path as string);
    return {
      toolName: this.name,
      params: invocation.params,
      description: `Delete path: ${target}`,
      affectedPaths: [target],
      isDangerous: true,
    };
  }

  async execute(invocation: ToolInvocation) {
    const params = invocation.params as { path: string; recursive?: boolean };
    const target = resolvePath(invocation.cwd, params.path);

    if (!fs.existsSync(target)) {
      return ToolResultFactory.error(`Path not found: ${target}`);
    }

    try {
      const stat = fs.statSync(target);
      if (stat.isDirectory()) {
        if (!params.recursive) {
          return ToolResultFactory.error("Target is a directory. Set recursive=true to delete.");
        }
        fs.rmSync(target, { recursive: true, force: true });
      } else {
        fs.unlinkSync(target);
      }

      return ToolResultFactory.success(`Deleted ${target}`, {
        metadata: {
          path: path.resolve(target),
        },
      });
    } catch (error) {
      return ToolResultFactory.error(`Failed to delete: ${String(error)}`);
    }
  }
}
