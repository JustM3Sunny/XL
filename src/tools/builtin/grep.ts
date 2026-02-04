import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { Tool, ToolInvocation, ToolKind, ToolResultFactory } from "../base.js";
import { resolvePath, isBinaryFile } from "../../utils/paths.js";

export class GrepTool extends Tool {
  name = "grep";
  description = "Search files for a pattern.";
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
            description: "Pattern to search for",
          },
          case_insensitive: {
            type: "boolean",
            description: "Case-insensitive search",
          },
        },
        required: ["path", "pattern"],
      },
    };
  }

  async execute(invocation: ToolInvocation) {
    const params = invocation.params as { path: string; pattern: string; case_insensitive?: boolean };
    const base = resolvePath(invocation.cwd, params.path);
    const regex = new RegExp(params.pattern, params.case_insensitive ? "i" : undefined);

    try {
      const files = await fg(["**/*"], { cwd: base, dot: true, onlyFiles: true, ignore: ["**/node_modules/**", "**/.git/**"] });
      let matches = 0;
      const output: string[] = [];

      for (const file of files) {
        const absolute = path.resolve(base, file);
        if (isBinaryFile(absolute)) {
          continue;
        }
        const content = fs.readFileSync(absolute, "utf-8");
        const lines = content.split(/\r?\n/);
        lines.forEach((line, index) => {
          if (regex.test(line)) {
            matches += 1;
            output.push(`${absolute}:${index + 1}:${line}`);
          }
        });
      }

      return ToolResultFactory.success(output.join("\n") || "(no matches)", {
        metadata: {
          matches,
          files_searched: files.length,
        },
      });
    } catch (error) {
      return ToolResultFactory.error(`Grep failed: ${String(error)}`);
    }
  }
}
