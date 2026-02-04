import fs from "node:fs";
import path from "node:path";
import { Tool, ToolConfirmation, ToolInvocation, ToolKind, ToolResultFactory } from "../base.js";
import { ensureParentDirectory, resolvePath } from "../../utils/paths.js";

export class CopyFileTool extends Tool {
  name = "copy_file";
  description = "Copy a file or directory.";
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
          recursive: {
            type: "boolean",
            description: "Copy directories recursively",
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
      description: `Copy ${source} -> ${destination}`,
      affectedPaths: [source, destination],
    };
  }

  async execute(invocation: ToolInvocation) {
    const params = invocation.params as { source: string; destination: string; overwrite?: boolean; recursive?: boolean };
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
      const stat = fs.statSync(source);
      if (stat.isDirectory()) {
        if (!params.recursive) {
          return ToolResultFactory.error("Source is a directory. Set recursive=true to copy.");
        }
        fs.cpSync(source, destination, { recursive: true, force: Boolean(params.overwrite) });
      } else {
        fs.copyFileSync(source, destination);
      }

      return ToolResultFactory.success(`Copied ${source} -> ${destination}`, {
        metadata: {
          source: path.resolve(source),
          destination: path.resolve(destination),
        },
      });
    } catch (error) {
      return ToolResultFactory.error(`Failed to copy: ${String(error)}`);
    }
  }
}
