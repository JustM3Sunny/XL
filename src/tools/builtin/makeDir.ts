import fs from "node:fs";
import path from "node:path";
import { Tool, ToolConfirmation, ToolInvocation, ToolKind, ToolResultFactory } from "../base.js";
import { resolvePath } from "../../utils/paths.js";

export class MakeDirTool extends Tool {
  name = "make_dir";
  description = "Create a directory (including parents).";
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
            description: "Directory path to create",
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
      description: `Create directory: ${target}`,
      affectedPaths: [target],
    };
  }

  async execute(invocation: ToolInvocation) {
    const params = invocation.params as { path: string };
    const target = resolvePath(invocation.cwd, params.path);

    try {
      fs.mkdirSync(target, { recursive: true });
      return ToolResultFactory.success(`Created directory: ${target}`, {
        metadata: {
          path: path.resolve(target),
        },
      });
    } catch (error) {
      return ToolResultFactory.error(`Failed to create directory: ${String(error)}`);
    }
  }
}
