import fs from "node:fs";
import { Tool, ToolConfirmation, ToolInvocation, ToolKind, ToolResultFactory, UnifiedFileDiff } from "../base.js";
import { ensureParentDirectory, resolvePath } from "../../utils/paths.js";

export class EditTool extends Tool {
  name = "edit";
  description = "Edit a file by replacing text. The old_string must match exactly (including whitespace and indentation) and must be unique in the file unless replace_all is true. Use this for precise, surgical edits. For creating new files or complete rewrites, use write_file instead.";
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
            description: "Path to the file to edit (relative to working directory or absolute path)",
          },
          old_string: {
            type: "string",
            description: "The exact text to find and replace. Must match exactly including all whitespace and indentation. For new files, leave this empty.",
          },
          new_string: {
            type: "string",
            description: "The text to replace old_string with. Can be empty to delete text",
          },
          replace_all: {
            type: "boolean",
            description: "Replace all occurrences of old_string (default: false)",
          },
        },
        required: ["path", "new_string"],
      },
    };
  }

  async getConfirmation(invocation: ToolInvocation): Promise<ToolConfirmation | null> {
    const params = invocation.params as { path: string; old_string?: string; new_string: string; replace_all?: boolean };
    const target = resolvePath(invocation.cwd, params.path);
    const exists = fs.existsSync(target);

    if (!exists) {
      const diff = new UnifiedFileDiff({ path: target, oldContent: "", newContent: params.new_string, isNewFile: true });
      return {
        toolName: this.name,
        params: invocation.params,
        description: `Create new file: ${target}`,
        diff,
        affectedPaths: [target],
      };
    }

    const oldContent = fs.readFileSync(target, "utf-8");
    const replaceAll = Boolean(params.replace_all);
    const newContent = replaceAll
      ? oldContent.replaceAll(params.old_string ?? "", params.new_string)
      : oldContent.replace(params.old_string ?? "", params.new_string);

    return {
      toolName: this.name,
      params: invocation.params,
      description: `Edit file: ${target}`,
      diff: new UnifiedFileDiff({ path: target, oldContent, newContent }),
      affectedPaths: [target],
    };
  }

  async execute(invocation: ToolInvocation) {
    const params = invocation.params as { path: string; old_string?: string; new_string: string; replace_all?: boolean };
    const target = resolvePath(invocation.cwd, params.path);

    if (!fs.existsSync(target)) {
      if (params.old_string) {
        return ToolResultFactory.error(
          `File does not exist: ${target}. To create a new file, use an empty old_string.`,
        );
      }

      ensureParentDirectory(target);
      fs.writeFileSync(target, params.new_string, "utf-8");
      const lineCount = params.new_string.split(/\r?\n/).length;
      return ToolResultFactory.success(`Created ${target} ${lineCount} lines`, {
        diff: new UnifiedFileDiff({ path: target, oldContent: "", newContent: params.new_string, isNewFile: true }),
        metadata: {
          path: target,
          is_new_file: true,
          lines: lineCount,
        },
      });
    }

    const oldContent = fs.readFileSync(target, "utf-8");

    if (!params.old_string) {
      return ToolResultFactory.error(
        "old_string is empty but file exists. Provide old_string to edit, or use write_file to overwrite.",
      );
    }

    const occurrenceCount = oldContent.split(params.old_string).length - 1;
    if (occurrenceCount === 0) {
      return this.noMatchError(params.old_string, oldContent, target);
    }

    if (occurrenceCount > 1 && !params.replace_all) {
      return ToolResultFactory.error(
        `old_string found ${occurrenceCount} times in ${target}. Either: \n1. Provide more context to make the match unique or\n2. Set replace_all=true to replace all occurrences`,
        "",
        { metadata: { occurrence_count: occurrenceCount } },
      );
    }

    const replaceAll = Boolean(params.replace_all);
    const newContent = replaceAll
      ? oldContent.replaceAll(params.old_string, params.new_string)
      : oldContent.replace(params.old_string, params.new_string);
    const replaceCount = replaceAll ? occurrenceCount : 1;

    if (newContent === oldContent) {
      return ToolResultFactory.error("No change made - old_string equals new_string");
    }

    try {
      fs.writeFileSync(target, newContent, "utf-8");
    } catch (error) {
      return ToolResultFactory.error(`failed to write file: ${String(error)}`);
    }

    const oldLines = oldContent.split(/\r?\n/).length;
    const newLines = newContent.split(/\r?\n/).length;
    const lineDiff = newLines - oldLines;

    const diffMsg = lineDiff > 0 ? ` (+${lineDiff} lines)` : lineDiff < 0 ? ` (${lineDiff} lines)` : "";

    return ToolResultFactory.success(`Edited ${target}: replaced ${replaceCount} occurrence(s)${diffMsg}`, {
      diff: new UnifiedFileDiff({ path: target, oldContent, newContent }),
      metadata: {
        path: target,
        replaced_count: replaceCount,
        line_diff: lineDiff,
      },
    });
  }

  private noMatchError(oldString: string, content: string, target: string) {
    const lines = content.split(/\r?\n/);
    const partialMatches: Array<{ line: number; preview: string }> = [];
    const searchTerms = oldString.split(/\s+/).slice(0, 5);

    if (searchTerms.length > 0) {
      const firstTerm = searchTerms[0];
      lines.forEach((line, index) => {
        if (partialMatches.length >= 3) {
          return;
        }
        if (line.includes(firstTerm)) {
          partialMatches.push({ line: index + 1, preview: line.trim().slice(0, 80) });
        }
      });
    }

    let errorMsg = `old_string not found in ${target}.`;

    if (partialMatches.length > 0) {
      errorMsg += "\n\nPossible similar lines:";
      for (const match of partialMatches) {
        errorMsg += `\n  Line ${match.line}: ${match.preview}`;
      }
      errorMsg += "\n\nMake sure old_string matches exactly (including whitespace and indentation).";
    } else {
      errorMsg +=
        " Make sure the text matches exactly, including:\n- All whitespace and indentation\n- Line breaks\n- Any invisible characters\nTry re-reading the file using read_file tool and then editing.";
    }

    return ToolResultFactory.error(errorMsg);
  }
}
