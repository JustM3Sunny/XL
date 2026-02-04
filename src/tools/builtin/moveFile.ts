import fs from "node:fs";
import path from "node:path";
import { Tool, ToolConfirmation, ToolInvocation, ToolKind, ToolResultFactory } from "../base.js";
import { ensureParentDirectory, resolvePath } from "../../utils/paths.js";

export class MoveFileTool extends Tool {
  name = "move_file";
  description = "Move or rename a file or directory.";
  kind = ToolKind.WRITE;

  get schema() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "Source path",
          },
          destination: {
            type: "string",
            description: "Destination path",
          },
          overwrite: {
            type: "boolean",
            description: "Overwrite destination if it exists",
          },
        },
        required: ["source", "destination"],
      },
    };
  }

  async getConfirmation(invocation: ToolInvocation): Promise<ToolConfirmation | null> {
    const source = resolvePath(invocation.cwd, invocation.params.source as string);
    const destination = resolvePath(invocation.cwd, invocation.params.destination as string);
    return {
      toolName: this.name,
      params: invocation.params,
      description: `Move ${source} -> ${destination}`,
      affectedPaths: [source, destination],
    };
  }

  async execute(invocation: ToolInvocation) {
    const params = invocation.params as { source: string; destination: string; overwrite?: boolean };
    const source = resolvePath(invocation.cwd, params.source);
    const destination = resolvePath(invocation.cwd, params.destination);

    if (!fs.existsSync(source)) {
      return ToolResultFactory.error(`Source not found: ${source}`);
    }

    if (fs.existsSync(destination) && !params.overwrite) {
      return ToolResultFactory.error(`Destination exists: ${destination}. Set overwrite=true to replace.`);
    }

    try {
      ensureParentDirectory(destination);
      fs.renameSync(source, destination);
      return ToolResultFactory.success(`Moved ${source} -> ${destination}`, {
        metadata: {
          source: path.resolve(source),
          destination: path.resolve(destination),
        },
      });
    } catch (error) {
      return ToolResultFactory.error(`Failed to move: ${String(error)}`);
    }
  }
}
