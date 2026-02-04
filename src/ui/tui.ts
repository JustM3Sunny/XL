import chalk from "chalk";
import boxen from "boxen";
import Table from "cli-table3";
import prompts from "prompts";
import { Config } from "../config/config.js";
import { ToolConfirmation } from "../tools/base.js";
import { displayPathRelToCwd } from "../utils/paths.js";
import { truncateText } from "../utils/text.js";

export class TUI {
  private assistantStreaming = false;
  private toolArgsByCallId = new Map<string, Record<string, any>>();
  private config: Config;
  private cwd: string;
  private maxBlockTokens = 2500;

  constructor(config: Config) {
    this.config = config;
    this.cwd = config.cwd;
  }

  beginAssistant(): void {
    process.stdout.write("\n" + chalk.bold("Assistant") + "\n");
    this.assistantStreaming = true;
  }

  endAssistant(): void {
    if (this.assistantStreaming) {
      process.stdout.write("\n");
    }
    this.assistantStreaming = false;
  }

  streamAssistantDelta(content: string): void {
    process.stdout.write(content);
  }

  printWelcome(title: string, lines: string[]): void {
    const body = lines.join("\n");
    console.log(
      boxen(chalk.cyan(body), {
        title: chalk.bold(title),
        padding: 1,
        borderColor: "gray",
      }),
    );
  }

  private orderedArgs(toolName: string, args: Record<string, any>): Array<[string, any]> {
    const preferred: Record<string, string[]> = {
      read_file: ["path", "offset", "limit"],
      write_file: ["path", "create_directories", "content"],
      edit: ["path", "replace_all", "old_string", "new_string"],
      shell: ["command", "timeout", "cwd"],
      list_dir: ["path", "include_hidden"],
      grep: ["path", "case_insensitive", "pattern"],
      glob: ["path", "pattern"],
      todos: ["id", "action", "content"],
      memory: ["action", "key", "value"],
      copy_file: ["source", "destination", "overwrite", "recursive"],
      move_file: ["source", "destination", "overwrite"],
      delete_file: ["path", "recursive"],
      make_dir: ["path"],
    };

    const order = preferred[toolName] ?? [];
    const ordered: Array<[string, any]> = [];
    const seen = new Set<string>();

    for (const key of order) {
      if (key in args) {
        ordered.push([key, args[key]]);
        seen.add(key);
      }
    }

    for (const [key, value] of Object.entries(args)) {
      if (!seen.has(key)) {
        ordered.push([key, value]);
      }
    }

    return ordered;
  }

  private renderArgsTable(toolName: string, args: Record<string, any>): string {
    const table = new Table({ colWidths: [18, 60] });
    for (const [key, value] of this.orderedArgs(toolName, args)) {
      let displayValue = value;
      if (typeof displayValue === "string" && ["content", "old_string", "new_string"].includes(key)) {
        const lineCount = displayValue.split("\n").length;
        const byteCount = Buffer.from(displayValue).byteLength;
        displayValue = `<${lineCount} lines • ${byteCount} bytes>`;
      }
      if (typeof displayValue === "boolean") {
        displayValue = displayValue ? "true" : "false";
      }
      table.push([chalk.gray(key), String(displayValue)]);
    }
    return table.toString();
  }

  toolCallStart(callId: string, name: string, toolKind: string | null, argumentsPayload: Record<string, any>): void {
    this.toolArgsByCallId.set(callId, argumentsPayload);
    const displayArgs = { ...argumentsPayload };
    for (const key of ["path", "cwd"]) {
      const value = displayArgs[key];
      if (typeof value === "string") {
        displayArgs[key] = displayPathRelToCwd(value, this.cwd);
      }
    }

    const header = `${chalk.magenta("⏺")} ${chalk.bold(name)} ${chalk.gray(`#${callId.slice(0, 8)}`)}`;
    const table = Object.keys(displayArgs).length > 0 ? this.renderArgsTable(name, displayArgs) : chalk.gray("(no args)");
    console.log("\n" + boxen(`${header}\n\n${table}`, { borderColor: toolKind ? "magenta" : "white", padding: 1 }));
  }

  toolCallComplete(
    callId: string,
    name: string,
    toolKind: string | null,
    success: boolean,
    output: string,
    error: string | null,
    metadata: Record<string, any> | null,
    diff: string | null,
    truncated: boolean,
    exitCode: number | null,
  ): void {
    const statusIcon = success ? chalk.green("✓") : chalk.red("✗");
    const header = `${statusIcon} ${chalk.bold(name)} ${chalk.gray(`#${callId.slice(0, 8)}`)}`;

    const blocks: string[] = [];
    if (name === "shell" && exitCode !== null) {
      blocks.push(chalk.gray(`exit_code=${exitCode}`));
    }
    if (diff && success && ["write_file", "edit"].includes(name)) {
      blocks.push(chalk.gray(output.trim() || "Completed"));
      blocks.push(diff);
    } else if (error && !success) {
      blocks.push(chalk.red(error));
    }

    if (output) {
      blocks.push(truncateText(output, this.config.modelName, this.maxBlockTokens));
    } else if (!blocks.length) {
      blocks.push(chalk.gray("(no output)"));
    }

    if (truncated) {
      blocks.push(chalk.yellow("note: tool output was truncated"));
    }

    const body = blocks.join("\n\n");
    console.log("\n" + boxen(`${header}\n\n${body}`, { borderColor: toolKind ? "magenta" : "white", padding: 1 }));
  }

  async handleConfirmation(confirmation: ToolConfirmation): Promise<boolean> {
    console.log("\n" + boxen(`${chalk.yellow("Approval required")}\n\n${confirmation.description}`, { borderColor: "yellow", padding: 1 }));
    if (confirmation.command) {
      console.log(chalk.yellow(`$ ${confirmation.command}`));
    }
    if (confirmation.diff) {
      console.log(confirmation.diff.toDiff());
    }
    const response = await prompts({
      type: "toggle",
      name: "approved",
      message: "Approve?",
      initial: false,
      active: "yes",
      inactive: "no",
    });
    return Boolean(response.approved);
  }

  showHelp(): void {
    console.log(`
Commands

- /help - Show this help
- /exit or /quit - Exit the agent
- /clear - Clear conversation history
- /config - Show current configuration
- /provider <name> - Change the provider
- /model <name> - Change the model
- /approval <mode> - Change approval mode
- /stats - Show session statistics
- /tools - List available tools
- /mcp - Show MCP server status
- /save - Save current session
- /checkpoint [name] - Create a checkpoint
- /checkpoints - List available checkpoints
- /restore <checkpoint_id> - Restore a checkpoint
- /sessions - List saved sessions
- /resume <session_id> - Resume a saved session

Tips

- Just type your message to chat with the agent
- The agent can read, write, and execute code
- Some operations require approval (can be configured)
`);
  }
}
