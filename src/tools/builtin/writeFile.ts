import fs from "node:fs";
import path from "node:path";
import { Tool, ToolConfirmation, ToolInvocation, ToolKind, ToolResultFactory, UnifiedFileDiff } from "../base.js";
import { ensureParentDirectory, resolvePath } from "../../utils/paths.js";

export class WriteFileTool extends Tool {
  name = "write_file";
  description = "Write content to a file. Creates files or overwrites existing files. Use for creating new files or full rewrites.";
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
            description: "Path to the file to write (relative to working directory or absolute)",
          },
          content: {
            type: "string",
            description: "File content to write",
          },
          create_directories: {
            type: "boolean",
            description: "Create parent directories if they do not exist",
          },
        },
        required: ["path", "content"],
      },
    };
  }

  async getConfirmation(invocation: ToolInvocation): Promise<ToolConfirmation | null> {
    const params = invocation.params as { path: string; content: string; create_directories?: boolean };
    const target = resolvePath(invocation.cwd, params.path);
    const exists = fs.existsSync(target);
    const oldContent = exists ? fs.readFileSync(target, "utf-8") : "";
    const diff = new UnifiedFileDiff({
      path: target,
      oldContent,
      newContent: params.content,
      isNewFile: !exists,
    });

    return {
      toolName: this.name,
      params: invocation.params,
      description: `${exists ? "Overwrite" : "Create"} file: ${target}`,
      diff,
      affectedPaths: [target],
    };
  }

  async execute(invocation: ToolInvocation) {
    const params = invocation.params as { path: string; content: string; create_directories?: boolean };
    const target = resolvePath(invocation.cwd, params.path);

    if (params.create_directories) {
      ensureParentDirectory(target);
    }

    let oldContent = "";
    const exists = fs.existsSync(target);
    if (exists) {
      oldContent = fs.readFileSync(target, "utf-8");
    }

    try {
      fs.writeFileSync(target, params.content, "utf-8");
      const lineCount = params.content.split(/\r?\n/).length;
      return ToolResultFactory.success(`Wrote ${target} (${lineCount} lines)`, {
        diff: new UnifiedFileDiff({
          path: target,
          oldContent,
          newContent: params.content,
          isNewFile: !exists,
        }),
        metadata: {
          path: target,
          is_new_file: !exists,
          lines: lineCount,
        },
      });
    } catch (error) {
      return ToolResultFactory.error(`Failed to write file: ${String(error)}`);
    }
  }
}
