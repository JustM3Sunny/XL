import fs from "node:fs";
import path from "node:path";
import { Tool, ToolInvocation, ToolKind, ToolResultFactory } from "../base.js";
import { resolvePath } from "../../utils/paths.js";

export class ListDirTool extends Tool {
  name = "list_dir";
  description = "List entries in a directory.";
  kind = ToolKind.READ;

  get schema() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory path to list",
          },
          include_hidden: {
            type: "boolean",
            description: "Include hidden files",
          },
        },
        required: ["path"],
      },
    };
  }

  async execute(invocation: ToolInvocation) {
    const params = invocation.params as { path: string; include_hidden?: boolean };
    const target = resolvePath(invocation.cwd, params.path);

    if (!fs.existsSync(target)) {
      return ToolResultFactory.error(`Directory not found: ${target}`);
    }

    const stat = fs.statSync(target);
    if (!stat.isDirectory()) {
      return ToolResultFactory.error(`Path is not a directory: ${target}`);
    }

    const entries = fs.readdirSync(target, { withFileTypes: true });
    const includeHidden = Boolean(params.include_hidden);
    const filtered = entries.filter((entry) => (includeHidden ? true : !entry.name.startsWith(".")));

    const output = filtered
      .map((entry) => {
        const suffix = entry.isDirectory() ? "/" : "";
        return `${entry.name}${suffix}`;
      })
      .sort((a, b) => a.localeCompare(b))
      .join("\n");

    return ToolResultFactory.success(output || "(empty)", {
      metadata: {
        path: path.resolve(target),
        entries: filtered.length,
      },
    });
  }
}
