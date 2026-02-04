import fg from "fast-glob";
import path from "node:path";
import { Tool, ToolInvocation, ToolKind, ToolResultFactory } from "../base.js";
import { resolvePath } from "../../utils/paths.js";

export class GlobTool extends Tool {
  name = "glob";
  description = "Find files matching a glob pattern.";
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
            description: "Base directory to search",
          },
          pattern: {
            type: "string",
            description: "Glob pattern",
          },
        },
        required: ["path", "pattern"],
      },
    };
  }

  async execute(invocation: ToolInvocation) {
    const params = invocation.params as { path: string; pattern: string };
    const base = resolvePath(invocation.cwd, params.path);

    try {
      const matches = await fg(params.pattern, { cwd: base, dot: true, onlyFiles: true });
      const output = matches.map((match) => path.resolve(base, match)).join("\n");
      return ToolResultFactory.success(output || "(no matches)", {
        metadata: {
          matches: matches.length,
        },
      });
    } catch (error) {
      return ToolResultFactory.error(`Glob failed: ${String(error)}`);
    }
  }
}
