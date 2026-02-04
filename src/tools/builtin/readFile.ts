import fs from "node:fs";
import path from "node:path";
import { Tool, ToolInvocation, ToolKind, ToolResultFactory } from "../base.js";
import { isBinaryFile, resolvePath } from "../../utils/paths.js";
import { countTokens, truncateText } from "../../utils/text.js";

export class ReadFileTool extends Tool {
  name = "read_file";
  description = "Read the contents of a text file. Returns the file content with line numbers. For large files, use offset and limit to read specific portions. Cannot read binary files (images, executables, etc.).";
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
            description: "Path to the file to read (relative to working directory or absolute)",
          },
          offset: {
            type: "integer",
            minimum: 1,
            description: "Line number to start reading from (1-based). Defaults to 1",
          },
          limit: {
            type: "integer",
            minimum: 1,
            description: "Maximum number of lines to read. If not specified, reads entire file.",
          },
        },
        required: ["path"],
      },
    };
  }

  static MAX_FILE_SIZE = 1024 * 1024 * 10;
  static MAX_OUTPUT_TOKENS = 25_000;

  async execute(invocation: ToolInvocation) {
    const params = invocation.params as { path: string; offset?: number; limit?: number };
    const targetPath = resolvePath(invocation.cwd, params.path);

    if (!fs.existsSync(targetPath)) {
      return ToolResultFactory.error(`File not found: ${targetPath}`);
    }

    const stat = fs.statSync(targetPath);
    if (!stat.isFile()) {
      return ToolResultFactory.error(`Path is not a file: ${targetPath}`);
    }

    if (stat.size > ReadFileTool.MAX_FILE_SIZE) {
      return ToolResultFactory.error(
        `File too large (${(stat.size / (1024 * 1024)).toFixed(1)}MB). Maximum is ${(ReadFileTool.MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB.`,
      );
    }

    if (isBinaryFile(targetPath)) {
      const sizeStr = stat.size > 1024 * 1024 ? `${(stat.size / (1024 * 1024)).toFixed(2)}MB` : `${stat.size} bytes`;
      return ToolResultFactory.error(`Cannot read binary file: ${path.basename(targetPath)} (${sizeStr}) This tool only reads text files.`);
    }

    try {
      let content: string;
      try {
        content = fs.readFileSync(targetPath, "utf-8");
      } catch (error) {
        content = fs.readFileSync(targetPath, "latin1");
      }

      const lines = content.split(/\r?\n/);
      const totalLines = lines.length;

      if (totalLines === 0) {
        return ToolResultFactory.success("File is empty.", { metadata: { lines: 0 } });
      }

      const offset = Math.max(0, (params.offset ?? 1) - 1);
      const endIdx = params.limit ? Math.min(offset + params.limit, totalLines) : totalLines;

      const selected = lines.slice(offset, endIdx);
      const formatted = selected.map((line, index) => `${String(index + offset + 1).padStart(6, " ")}|${line}`);

      let output = formatted.join("\n");
      const tokenCount = countTokens(output);
      let truncated = false;

      if (tokenCount > ReadFileTool.MAX_OUTPUT_TOKENS) {
        output = truncateText(output, this.config.modelName, ReadFileTool.MAX_OUTPUT_TOKENS, `\n... [truncated ${totalLines} total lines]`);
        truncated = true;
      }

      const metadataLines: string[] = [];
      if (offset > 0 || endIdx < totalLines) {
        metadataLines.push(`Showing lines ${offset + 1}-${endIdx} of ${totalLines}`);
      }

      if (metadataLines.length > 0) {
        output = `${metadataLines.join(" | ")}\n\n${output}`;
      }

      return ToolResultFactory.success(output, {
        truncated,
        metadata: {
          path: targetPath,
          total_lines: totalLines,
          shown_start: offset + 1,
          shown_end: endIdx,
        },
      });
    } catch (error) {
      return ToolResultFactory.error(`Failed to read file: ${String(error)}`);
    }
  }
}
